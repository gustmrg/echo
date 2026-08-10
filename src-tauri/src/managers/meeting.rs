use crate::audio_toolkit::audio::FrameResampler;
use crate::audio_toolkit::vad::{
    SmoothedVad, VoiceActivityDetector, VAD_OFFLINE_HANGOVER_FRAMES, VAD_ONSET_FRAMES,
    VAD_PREFILL_FRAMES,
};
use crate::audio_toolkit::SileroVad;
use crate::managers::transcription::TranscriptionManager;
use crate::settings::get_settings;
use anyhow::{anyhow, Result};
use chrono::Utc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use hound::{SampleFormat as WavSampleFormat, WavSpec, WavWriter};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

const TARGET_SAMPLE_RATE: u32 = 16_000;
const WRITER_QUEUE_CAPACITY: usize = 128;
const VAD_THRESHOLD: f32 = 0.3;
const VAD_FRAME_SAMPLES: usize = 480;
const MAX_CHUNK_SAMPLES: usize = TARGET_SAMPLE_RATE as usize * 30;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MeetingStatus {
    Recording,
    Transcribing,
    Completed,
    Failed,
    Interrupted,
}

impl MeetingStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Recording => "recording",
            Self::Transcribing => "transcribing",
            Self::Completed => "completed",
            Self::Failed => "failed",
            Self::Interrupted => "interrupted",
        }
    }

    fn parse(value: &str) -> Self {
        match value {
            "recording" => Self::Recording,
            "transcribing" => Self::Transcribing,
            "completed" => Self::Completed,
            "interrupted" => Self::Interrupted,
            _ => Self::Failed,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MeetingSource {
    Microphone,
    System,
}

impl MeetingSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Microphone => "microphone",
            Self::System => "system",
        }
    }

    fn parse(value: &str) -> Self {
        if value == "system" {
            Self::System
        } else {
            Self::Microphone
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct MeetingSegment {
    pub id: i64,
    pub meeting_id: i64,
    pub source: MeetingSource,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct MeetingSummary {
    pub id: i64,
    pub title: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub duration_ms: i64,
    pub status: MeetingStatus,
    pub transcript_text: String,
    pub error_message: Option<String>,
    pub dropped_microphone_packets: u64,
    pub dropped_system_packets: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct MeetingDetail {
    pub meeting: MeetingSummary,
    pub segments: Vec<MeetingSegment>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct MeetingCapabilities {
    pub supported: bool,
    pub platform: String,
    pub minimum_os: Option<String>,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
pub struct MeetingCaptureDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, Type, tauri_specta::Event)]
pub struct MeetingStateEvent {
    pub meeting_id: i64,
    pub status: MeetingStatus,
    pub phase: String,
    pub processed_ms: i64,
    pub duration_ms: i64,
    pub error: Option<String>,
}

enum WriterMessage {
    Samples {
        data: Vec<f32>,
        received_at: Instant,
    },
    Finish(Duration),
}

struct TrackWriter {
    tx: SyncSender<WriterMessage>,
    worker: JoinHandle<Result<u64>>,
    dropped_packets: Arc<AtomicU64>,
}

struct ActiveMeeting {
    id: i64,
    started: Instant,
    streams: Vec<cpal::Stream>,
    microphone: TrackWriter,
    system: TrackWriter,
    microphone_part: PathBuf,
    system_part: PathBuf,
    microphone_final: PathBuf,
    system_final: PathBuf,
    stream_error: Arc<Mutex<Option<String>>>,
}

pub struct MeetingManager {
    app_handle: AppHandle,
    root_dir: PathBuf,
    db_path: PathBuf,
    transcription_manager: Arc<TranscriptionManager>,
    active: Mutex<Option<ActiveMeeting>>,
    transcribing: AtomicBool,
}

impl MeetingManager {
    pub fn new(
        app_handle: &AppHandle,
        transcription_manager: Arc<TranscriptionManager>,
    ) -> Result<Self> {
        let app_data = crate::portable::app_data_dir(app_handle)?;
        let root_dir = app_data.join("meetings");
        fs::create_dir_all(&root_dir)?;
        let manager = Self {
            app_handle: app_handle.clone(),
            root_dir,
            db_path: app_data.join("meetings.db"),
            transcription_manager,
            active: Mutex::new(None),
            transcribing: AtomicBool::new(false),
        };
        manager.initialize_database()?;
        manager.recover_interrupted_sessions()?;
        Ok(manager)
    }

    fn connection(&self) -> Result<Connection> {
        Ok(Connection::open(&self.db_path)?)
    }

    fn initialize_database(&self) -> Result<()> {
        self.connection()?.execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS meeting_sessions (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               title TEXT NOT NULL DEFAULT '',
               started_at INTEGER NOT NULL,
               ended_at INTEGER,
               duration_ms INTEGER NOT NULL DEFAULT 0,
               status TEXT NOT NULL,
               microphone_path TEXT,
               system_path TEXT,
               transcript_text TEXT NOT NULL DEFAULT '',
               model_id TEXT,
               language TEXT,
               error_message TEXT,
               dropped_microphone_packets INTEGER NOT NULL DEFAULT 0,
               dropped_system_packets INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS meeting_segments (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               meeting_id INTEGER NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
               source TEXT NOT NULL,
               start_ms INTEGER NOT NULL,
               end_ms INTEGER NOT NULL,
               text TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_meeting_segments_timeline
               ON meeting_segments(meeting_id, start_ms, id);",
        )?;
        Ok(())
    }

    fn recover_interrupted_sessions(&self) -> Result<()> {
        let conn = self.connection()?;
        let recording_ids = {
            let mut statement = conn.prepare(
                "SELECT id FROM meeting_sessions WHERE status = 'recording' ORDER BY id",
            )?;
            let ids = statement
                .query_map([], |row| row.get::<_, i64>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            ids
        };
        for id in recording_ids {
            let meeting_dir = self.root_dir.join(id.to_string());
            let mut recovered_duration_ms = 0i64;
            for source in ["microphone", "system"] {
                let partial = meeting_dir.join(format!("{source}.part.wav"));
                let final_path = meeting_dir.join(format!("{source}.wav"));
                if !partial.exists() {
                    continue;
                }
                match repair_partial_wav(&partial).and_then(|samples| {
                    if final_path.exists() {
                        fs::remove_file(&final_path)?;
                    }
                    fs::rename(&partial, &final_path)?;
                    Ok(samples)
                }) {
                    Ok(samples) => {
                        recovered_duration_ms = recovered_duration_ms
                            .max((samples as i64 * 1_000) / TARGET_SAMPLE_RATE as i64);
                        log::info!(
                            "Recovered interrupted {source} recording for meeting {id}"
                        );
                    }
                    Err(error) => log::warn!(
                        "Could not recover interrupted {source} recording for meeting {id}: {error:#}"
                    ),
                }
            }
            if recovered_duration_ms > 0 {
                conn.execute(
                    "UPDATE meeting_sessions
                     SET duration_ms = ?1, ended_at = COALESCE(ended_at, started_at + ?1)
                     WHERE id = ?2",
                    params![recovered_duration_ms, id],
                )?;
            }
        }
        conn.execute(
            "UPDATE meeting_sessions
             SET status = 'interrupted', error_message = COALESCE(error_message, 'The app closed before the recording completed')
             WHERE status IN ('recording', 'transcribing')",
            [],
        )?;
        Ok(())
    }

    pub fn capabilities() -> MeetingCapabilities {
        let platform = std::env::consts::OS.to_string();
        #[cfg(target_os = "macos")]
        {
            let version = tauri_plugin_os::version().to_string();
            let supported = macos_meeting_version_supported(&version);
            MeetingCapabilities {
                supported,
                platform,
                minimum_os: Some("14.7".to_string()),
                reason: (!supported).then(|| "meeting_requires_macos_14_7".to_string()),
            }
        }
        #[cfg(target_os = "windows")]
        {
            MeetingCapabilities {
                supported: true,
                platform,
                minimum_os: None,
                reason: None,
            }
        }
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        MeetingCapabilities {
            supported: false,
            platform,
            minimum_os: None,
            reason: Some("meeting_unsupported_platform".to_string()),
        }
    }

    pub fn capture_devices(&self) -> Result<Vec<MeetingCaptureDevice>> {
        if !Self::capabilities().supported {
            return Ok(Vec::new());
        }
        let host = crate::audio_toolkit::get_cpal_host();
        let default_id = host
            .default_output_device()
            .and_then(|device| device.id().ok())
            .map(|id| id.to_string());
        let mut devices = Vec::new();
        for device in host.output_devices()? {
            let id = device.id()?.to_string();
            devices.push(MeetingCaptureDevice {
                is_default: default_id.as_deref() == Some(id.as_str()),
                id,
                name: device
                    .description()
                    .map(|description| description.name().to_string())
                    .unwrap_or_else(|_| "Unknown".to_string()),
            });
        }
        Ok(devices)
    }

    pub fn is_busy(&self) -> bool {
        self.active.lock().unwrap().is_some() || self.transcribing.load(Ordering::Acquire)
    }

    pub fn current(&self) -> Result<Option<MeetingSummary>> {
        if let Some(id) = self.active.lock().unwrap().as_ref().map(|active| active.id) {
            return self.get_summary(id).map(Some);
        }
        self.connection()?
            .query_row(
                "SELECT id, title, started_at, ended_at, duration_ms, status, transcript_text,
                        error_message, dropped_microphone_packets, dropped_system_packets
                 FROM meeting_sessions WHERE status = 'transcribing'
                 ORDER BY started_at DESC LIMIT 1",
                [],
                summary_from_row,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn start(&self) -> Result<MeetingSummary> {
        let capabilities = Self::capabilities();
        if !capabilities.supported {
            return Err(anyhow!(capabilities
                .reason
                .unwrap_or_else(|| "meeting capture is unavailable".to_string())));
        }
        if self.is_busy() {
            return Err(anyhow!("a meeting is already recording or transcribing"));
        }

        let started_at = Utc::now().timestamp_millis();
        let conn = self.connection()?;
        conn.execute(
            "INSERT INTO meeting_sessions(started_at, status) VALUES (?1, 'recording')",
            params![started_at],
        )?;
        let id = conn.last_insert_rowid();
        let meeting_dir = self.root_dir.join(id.to_string());
        fs::create_dir_all(&meeting_dir)?;

        let microphone_part = meeting_dir.join("microphone.part.wav");
        let system_part = meeting_dir.join("system.part.wav");
        let microphone_final = meeting_dir.join("microphone.wav");
        let system_final = meeting_dir.join("system.wav");
        conn.execute(
            "UPDATE meeting_sessions SET microphone_path = ?1, system_path = ?2 WHERE id = ?3",
            params![
                format!("{id}/microphone.wav"),
                format!("{id}/system.wav"),
                id
            ],
        )?;

        let result = self.open_capture(
            id,
            microphone_part.clone(),
            system_part.clone(),
            microphone_final,
            system_final,
        );
        let active = match result {
            Ok(active) => active,
            Err(error) => {
                let _ = fs::remove_dir_all(&meeting_dir);
                let _ = conn.execute("DELETE FROM meeting_sessions WHERE id = ?1", params![id]);
                return Err(error);
            }
        };
        *self.active.lock().unwrap() = Some(active);
        let meeting = self.get_summary(id)?;
        self.emit_state(&meeting, "recording", 0, None);
        Ok(meeting)
    }

    fn open_capture(
        &self,
        id: i64,
        microphone_part: PathBuf,
        system_part: PathBuf,
        microphone_final: PathBuf,
        system_final: PathBuf,
    ) -> Result<ActiveMeeting> {
        let started = Instant::now();
        let settings = get_settings(&self.app_handle);
        let host = crate::audio_toolkit::get_cpal_host();
        let microphone_device =
            resolve_microphone_device(&host, settings.selected_microphone.as_deref())?;
        let output_device =
            resolve_output_device(&host, settings.meeting_output_device_id.as_deref())?;
        let microphone_config = microphone_device.default_input_config()?;
        let system_config = output_device.default_output_config()?;
        let stream_error = Arc::new(Mutex::new(None));

        let microphone = spawn_track_writer(
            microphone_part.clone(),
            microphone_config.sample_rate() as usize,
            started,
        )?;
        let system = spawn_track_writer(
            system_part.clone(),
            system_config.sample_rate() as usize,
            started,
        )?;

        let microphone_stream = build_capture_stream(
            &microphone_device,
            &microphone_config,
            microphone.tx.clone(),
            settings.selected_channel.map(usize::from),
            Arc::clone(&microphone.dropped_packets),
            Arc::clone(&stream_error),
            "microphone",
        )?;
        let system_stream = build_capture_stream(
            &output_device,
            &system_config,
            system.tx.clone(),
            None,
            Arc::clone(&system.dropped_packets),
            Arc::clone(&stream_error),
            "system",
        )?;
        microphone_stream.play()?;
        system_stream.play()?;

        Ok(ActiveMeeting {
            id,
            started,
            streams: vec![microphone_stream, system_stream],
            microphone,
            system,
            microphone_part,
            system_part,
            microphone_final,
            system_final,
            stream_error,
        })
    }

    pub fn stop(self: &Arc<Self>) -> Result<MeetingSummary> {
        let active = self
            .active
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| anyhow!("no meeting is recording"))?;
        let duration = active.started.elapsed();
        let ended_at = Utc::now().timestamp_millis();
        drop(active.streams);

        let mic_dropped = active.microphone.dropped_packets.load(Ordering::Relaxed);
        let sys_dropped = active.system.dropped_packets.load(Ordering::Relaxed);
        let _ = active.microphone.tx.send(WriterMessage::Finish(duration));
        let _ = active.system.tx.send(WriterMessage::Finish(duration));
        let mic_samples = active
            .microphone
            .worker
            .join()
            .map_err(|_| anyhow!("microphone writer thread panicked"))??;
        let system_samples = active
            .system
            .worker
            .join()
            .map_err(|_| anyhow!("system writer thread panicked"))??;
        fs::rename(&active.microphone_part, &active.microphone_final)?;
        fs::rename(&active.system_part, &active.system_final)?;

        let capture_error = active.stream_error.lock().unwrap().clone().or_else(|| {
            match (mic_samples == 0, system_samples == 0) {
                (true, true) => Some("No microphone or meeting audio was captured".to_string()),
                (true, false) => Some("No microphone audio was captured".to_string()),
                (false, true) => Some("No meeting audio was captured".to_string()),
                (false, false) => None,
            }
        });
        let status = if capture_error.is_some() {
            MeetingStatus::Interrupted
        } else {
            MeetingStatus::Transcribing
        };
        self.connection()?.execute(
            "UPDATE meeting_sessions SET ended_at = ?1, duration_ms = ?2, status = ?3,
             dropped_microphone_packets = ?4, dropped_system_packets = ?5, error_message = ?6
             WHERE id = ?7",
            params![
                ended_at,
                duration.as_millis() as i64,
                status.as_str(),
                mic_dropped,
                sys_dropped,
                capture_error,
                active.id
            ],
        )?;
        let meeting = self.get_summary(active.id)?;
        self.emit_state(&meeting, "captured", 0, meeting.error_message.clone());
        if status == MeetingStatus::Transcribing {
            self.spawn_transcription(active.id)?;
        }
        Ok(meeting)
    }

    pub fn cancel(&self) -> Result<()> {
        let active = self
            .active
            .lock()
            .unwrap()
            .take()
            .ok_or_else(|| anyhow!("no meeting is recording"))?;
        drop(active.streams);
        drop(active.microphone.tx);
        drop(active.system.tx);
        let _ = active.microphone.worker.join();
        let _ = active.system.worker.join();
        let meeting_dir = self.root_dir.join(active.id.to_string());
        let _ = fs::remove_dir_all(meeting_dir);
        self.connection()?.execute(
            "DELETE FROM meeting_sessions WHERE id = ?1",
            params![active.id],
        )?;
        Ok(())
    }

    pub fn retry_transcription(self: &Arc<Self>, id: i64) -> Result<()> {
        if self.is_busy() {
            return Err(anyhow!("another meeting is recording or transcribing"));
        }
        let meeting = self.get_summary(id)?;
        if meeting.status == MeetingStatus::Recording {
            return Err(anyhow!("the meeting is still recording"));
        }
        self.connection()?.execute(
            "UPDATE meeting_sessions SET status = 'transcribing', error_message = NULL WHERE id = ?1",
            params![id],
        )?;
        self.spawn_transcription(id)
    }

    fn spawn_transcription(self: &Arc<Self>, id: i64) -> Result<()> {
        if self.transcribing.swap(true, Ordering::AcqRel) {
            return Err(anyhow!("another meeting is already transcribing"));
        }
        let manager = Arc::clone(self);
        std::thread::spawn(move || {
            if let Err(error) = manager.transcribe_meeting(id) {
                log::error!("Meeting {id} transcription failed: {error:#}");
                let message = error.to_string();
                let _ = manager.connection().and_then(|conn| {
                    conn.execute(
                        "UPDATE meeting_sessions SET status = 'failed', error_message = ?1 WHERE id = ?2",
                        params![message, id],
                    )?;
                    Ok(())
                });
                if let Ok(meeting) = manager.get_summary(id) {
                    manager.emit_state(&meeting, "failed", 0, Some(error.to_string()));
                }
            }
            manager.transcribing.store(false, Ordering::Release);
        });
        Ok(())
    }

    fn transcribe_meeting(&self, id: i64) -> Result<()> {
        let meeting = self.get_summary(id)?;
        let settings = get_settings(&self.app_handle);
        if settings.selected_model.is_empty() {
            return Err(anyhow!("no transcription model is selected"));
        }
        if self.transcription_manager.get_current_model().as_deref()
            != Some(settings.selected_model.as_str())
        {
            self.transcription_manager
                .load_model(&settings.selected_model)?;
        }

        let detail_paths = self.audio_paths(id)?;
        let mut segments = Vec::new();
        self.emit_state(&meeting, "transcribing_system", 0, None);
        segments.extend(self.transcribe_track(
            id,
            MeetingSource::System,
            Path::new(&detail_paths.1),
            meeting.duration_ms,
        )?);
        self.emit_state(&meeting, "transcribing_microphone", 0, None);
        segments.extend(self.transcribe_track(
            id,
            MeetingSource::Microphone,
            Path::new(&detail_paths.0),
            meeting.duration_ms,
        )?);

        deduplicate_echo(&mut segments);
        segments.sort_by_key(|segment| {
            (
                segment.start_ms,
                if segment.source == MeetingSource::System {
                    0
                } else {
                    1
                },
            )
        });
        let transcript = segments
            .iter()
            .map(|segment| {
                let label = if segment.source == MeetingSource::Microphone {
                    "You"
                } else {
                    "Meeting"
                };
                format!(
                    "[{}] {label}: {}",
                    format_timestamp(segment.start_ms),
                    segment.text
                )
            })
            .collect::<Vec<_>>()
            .join("\n");

        let mut conn = self.connection()?;
        let tx = conn.transaction()?;
        tx.execute(
            "DELETE FROM meeting_segments WHERE meeting_id = ?1",
            params![id],
        )?;
        for segment in &segments {
            tx.execute(
                "INSERT INTO meeting_segments(meeting_id, source, start_ms, end_ms, text)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    id,
                    segment.source.as_str(),
                    segment.start_ms,
                    segment.end_ms,
                    segment.text
                ],
            )?;
        }
        tx.execute(
            "UPDATE meeting_sessions SET status = 'completed', transcript_text = ?1,
             model_id = ?2, language = ?3, error_message = NULL WHERE id = ?4",
            params![
                transcript,
                settings.selected_model,
                settings.selected_language,
                id
            ],
        )?;
        tx.commit()?;
        let completed = self.get_summary(id)?;
        self.emit_state(&completed, "completed", completed.duration_ms, None);
        Ok(())
    }

    fn transcribe_track(
        &self,
        meeting_id: i64,
        source: MeetingSource,
        path: &Path,
        duration_ms: i64,
    ) -> Result<Vec<MeetingSegment>> {
        let vad_path = self.app_handle.path().resolve(
            "resources/models/silero_vad_v4.onnx",
            BaseDirectory::Resource,
        )?;
        let silero = SileroVad::new(vad_path, VAD_THRESHOLD)?;
        let mut vad = SmoothedVad::new(
            Box::new(silero),
            VAD_PREFILL_FRAMES,
            VAD_OFFLINE_HANGOVER_FRAMES,
            VAD_ONSET_FRAMES,
        );
        let mut reader = hound::WavReader::open(path)?;
        if reader.spec().sample_rate != TARGET_SAMPLE_RATE || reader.spec().channels != 1 {
            return Err(anyhow!("meeting track is not 16 kHz mono PCM"));
        }
        let mut input = reader.samples::<i16>();
        let mut frame = Vec::with_capacity(VAD_FRAME_SAMPLES);
        let mut speech = Vec::new();
        let mut speech_start = 0usize;
        let mut elapsed = 0usize;
        let mut result = Vec::new();

        loop {
            frame.clear();
            for _ in 0..VAD_FRAME_SAMPLES {
                match input.next() {
                    Some(sample) => frame.push(sample? as f32 / i16::MAX as f32),
                    None => break,
                }
            }
            if frame.is_empty() {
                break;
            }
            let actual_len = frame.len();
            frame.resize(VAD_FRAME_SAMPLES, 0.0);
            match vad.push_frame(&frame)? {
                crate::audio_toolkit::vad::VadFrame::Speech(samples) => {
                    if speech.is_empty() {
                        speech_start = (elapsed + VAD_FRAME_SAMPLES).saturating_sub(samples.len());
                    }
                    speech.extend_from_slice(samples);
                    if speech.len() >= MAX_CHUNK_SAMPLES {
                        result.push(self.transcribe_speech_chunk(
                            meeting_id,
                            source,
                            speech_start,
                            &speech,
                        )?);
                        speech.clear();
                    }
                }
                crate::audio_toolkit::vad::VadFrame::Noise if !speech.is_empty() => {
                    result.push(self.transcribe_speech_chunk(
                        meeting_id,
                        source,
                        speech_start,
                        &speech,
                    )?);
                    speech.clear();
                }
                crate::audio_toolkit::vad::VadFrame::Noise => {}
            }
            elapsed += actual_len;
            if elapsed % (TARGET_SAMPLE_RATE as usize * 10) < VAD_FRAME_SAMPLES {
                let phase = if source == MeetingSource::System {
                    "transcribing_system"
                } else {
                    "transcribing_microphone"
                };
                if let Ok(meeting) = self.get_summary(meeting_id) {
                    self.emit_state(
                        &meeting,
                        phase,
                        (elapsed as i64 * 1000) / TARGET_SAMPLE_RATE as i64,
                        None,
                    );
                }
            }
        }
        if !speech.is_empty() {
            result.push(self.transcribe_speech_chunk(meeting_id, source, speech_start, &speech)?);
        }
        result.retain(|segment| !segment.text.trim().is_empty());
        for segment in &mut result {
            segment.end_ms = segment.end_ms.min(duration_ms);
        }
        Ok(result)
    }

    fn transcribe_speech_chunk(
        &self,
        meeting_id: i64,
        source: MeetingSource,
        start_sample: usize,
        samples: &[f32],
    ) -> Result<MeetingSegment> {
        let original_len = samples.len();
        let mut padded = samples.to_vec();
        padded.resize(padded.len().max(TARGET_SAMPLE_RATE as usize), 0.0);
        let settings = get_settings(&self.app_handle);
        if self.transcription_manager.get_current_model().is_none() {
            self.transcription_manager
                .load_model(&settings.selected_model)?;
        }
        let text = self.transcription_manager.transcribe_quiet(padded)?;
        Ok(MeetingSegment {
            id: 0,
            meeting_id,
            source,
            start_ms: start_sample as i64 * 1000 / TARGET_SAMPLE_RATE as i64,
            end_ms: (start_sample + original_len) as i64 * 1000 / TARGET_SAMPLE_RATE as i64,
            text: text.trim().to_string(),
        })
    }

    pub fn list(&self, offset: usize, limit: usize) -> Result<Vec<MeetingSummary>> {
        let conn = self.connection()?;
        let mut statement = conn.prepare(
            "SELECT id, title, started_at, ended_at, duration_ms, status, transcript_text,
                    error_message, dropped_microphone_packets, dropped_system_packets
             FROM meeting_sessions ORDER BY started_at DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = statement.query_map(params![limit as i64, offset as i64], summary_from_row)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get_summary(&self, id: i64) -> Result<MeetingSummary> {
        self.connection()?
            .query_row(
                "SELECT id, title, started_at, ended_at, duration_ms, status, transcript_text,
                        error_message, dropped_microphone_packets, dropped_system_packets
                 FROM meeting_sessions WHERE id = ?1",
                params![id],
                summary_from_row,
            )
            .optional()?
            .ok_or_else(|| anyhow!("meeting not found"))
    }

    pub fn get_detail(&self, id: i64) -> Result<MeetingDetail> {
        let meeting = self.get_summary(id)?;
        let conn = self.connection()?;
        let mut statement = conn.prepare(
            "SELECT id, meeting_id, source, start_ms, end_ms, text
             FROM meeting_segments WHERE meeting_id = ?1 ORDER BY start_ms, id",
        )?;
        let rows = statement.query_map(params![id], |row| {
            Ok(MeetingSegment {
                id: row.get(0)?,
                meeting_id: row.get(1)?,
                source: MeetingSource::parse(&row.get::<_, String>(2)?),
                start_ms: row.get(3)?,
                end_ms: row.get(4)?,
                text: row.get(5)?,
            })
        })?;
        Ok(MeetingDetail {
            meeting,
            segments: rows.collect::<std::result::Result<Vec<_>, _>>()?,
        })
    }

    pub fn rename(&self, id: i64, title: String) -> Result<MeetingSummary> {
        let title = title.trim();
        if title.len() > 200 {
            return Err(anyhow!("meeting title is too long"));
        }
        self.connection()?.execute(
            "UPDATE meeting_sessions SET title = ?1 WHERE id = ?2",
            params![title, id],
        )?;
        self.get_summary(id)
    }

    pub fn delete(&self, id: i64) -> Result<()> {
        if self
            .active
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|active| active.id == id)
        {
            return Err(anyhow!("cannot delete a meeting while it is recording"));
        }
        let meeting_dir = self.root_dir.join(id.to_string());
        if meeting_dir.exists() {
            fs::remove_dir_all(&meeting_dir)?;
        }
        self.connection()?
            .execute("DELETE FROM meeting_sessions WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn audio_paths(&self, id: i64) -> Result<(String, String)> {
        let conn = self.connection()?;
        let (microphone, system): (String, String) = conn.query_row(
            "SELECT microphone_path, system_path FROM meeting_sessions WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok((
            self.root_dir.join(microphone).to_string_lossy().to_string(),
            self.root_dir.join(system).to_string_lossy().to_string(),
        ))
    }

    fn emit_state(
        &self,
        meeting: &MeetingSummary,
        phase: &str,
        processed_ms: i64,
        error: Option<String>,
    ) {
        let _ = MeetingStateEvent {
            meeting_id: meeting.id,
            status: meeting.status,
            phase: phase.to_string(),
            processed_ms,
            duration_ms: meeting.duration_ms,
            error,
        }
        .emit(&self.app_handle);
    }
}

fn summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MeetingSummary> {
    Ok(MeetingSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        duration_ms: row.get(4)?,
        status: MeetingStatus::parse(&row.get::<_, String>(5)?),
        transcript_text: row.get(6)?,
        error_message: row.get(7)?,
        dropped_microphone_packets: row.get(8)?,
        dropped_system_packets: row.get(9)?,
    })
}

fn resolve_microphone_device(
    host: &cpal::Host,
    selected_name: Option<&str>,
) -> Result<cpal::Device> {
    if let Some(selected_name) = selected_name {
        if let Some(device) = host.input_devices()?.find(|device| {
            device
                .description()
                .is_ok_and(|description| description.name() == selected_name)
        }) {
            return Ok(device);
        }
    }
    host.default_input_device()
        .ok_or_else(|| anyhow!("no microphone is available"))
}

fn resolve_output_device(host: &cpal::Host, selected_id: Option<&str>) -> Result<cpal::Device> {
    if let Some(selected_id) = selected_id {
        if let Some(device) = host
            .output_devices()?
            .find(|device| device.id().is_ok_and(|id| id.to_string() == selected_id))
        {
            return Ok(device);
        }
        return Err(anyhow!(
            "the selected meeting output device is no longer available"
        ));
    }
    host.default_output_device()
        .ok_or_else(|| anyhow!("no system output device is available"))
}

fn spawn_track_writer(path: PathBuf, input_rate: usize, started: Instant) -> Result<TrackWriter> {
    let (tx, rx) = mpsc::sync_channel(WRITER_QUEUE_CAPACITY);
    let dropped_packets = Arc::new(AtomicU64::new(0));
    let worker = std::thread::Builder::new()
        .name("meeting-wav-writer".to_string())
        .spawn(move || writer_loop(&path, input_rate, started, rx))?;
    Ok(TrackWriter {
        tx,
        worker,
        dropped_packets,
    })
}

fn writer_loop(
    path: &Path,
    input_rate: usize,
    started: Instant,
    rx: Receiver<WriterMessage>,
) -> Result<u64> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: TARGET_SAMPLE_RATE,
        bits_per_sample: 16,
        sample_format: WavSampleFormat::Int,
    };
    let mut writer = WavWriter::create(path, spec)?;
    let mut resampler = FrameResampler::new(
        input_rate,
        TARGET_SAMPLE_RATE as usize,
        Duration::from_millis(30),
    );
    let mut written = 0u64;
    let mut first_packet = true;
    let mut packets_since_flush = 0usize;
    while let Ok(message) = rx.recv() {
        match message {
            WriterMessage::Samples { data, received_at } => {
                if first_packet {
                    let leading = received_at.saturating_duration_since(started).as_secs_f64();
                    let leading_samples = (leading * TARGET_SAMPLE_RATE as f64).round() as usize;
                    for _ in 0..leading_samples {
                        writer.write_sample(0i16)?;
                    }
                    written += leading_samples as u64;
                    first_packet = false;
                }
                let mut write_error = None;
                resampler.push(&data, |frame| {
                    if write_error.is_some() {
                        return;
                    }
                    for sample in frame {
                        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                        if let Err(error) = writer.write_sample(pcm) {
                            write_error = Some(error);
                            break;
                        }
                        written += 1;
                    }
                });
                if let Some(error) = write_error {
                    return Err(error.into());
                }
                packets_since_flush += 1;
                if packets_since_flush >= 32 {
                    writer.flush()?;
                    packets_since_flush = 0;
                }
            }
            WriterMessage::Finish(duration) => {
                let mut write_error = None;
                resampler.finish(|frame| {
                    if write_error.is_some() {
                        return;
                    }
                    for sample in frame {
                        let pcm = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
                        if let Err(error) = writer.write_sample(pcm) {
                            write_error = Some(error);
                            break;
                        }
                        written += 1;
                    }
                });
                if let Some(error) = write_error {
                    return Err(error.into());
                }
                let target = (duration.as_secs_f64() * TARGET_SAMPLE_RATE as f64).round() as u64;
                while written < target {
                    writer.write_sample(0i16)?;
                    written += 1;
                }
                break;
            }
        }
    }
    writer.finalize()?;
    Ok(written)
}

/// Repairs the canonical PCM WAV header written by `writer_loop` after an unclean exit.
/// Audio samples already flushed to disk remain usable; only the RIFF/data sizes are stale.
fn repair_partial_wav(path: &Path) -> Result<u64> {
    let mut file = OpenOptions::new().read(true).write(true).open(path)?;
    let length = file.metadata()?.len();
    if length < 44 || length > u32::MAX as u64 {
        return Err(anyhow!("partial WAV has an invalid length"));
    }

    let mut header = [0u8; 44];
    file.read_exact(&mut header)?;
    if &header[0..4] != b"RIFF"
        || &header[8..12] != b"WAVE"
        || &header[12..16] != b"fmt "
        || &header[36..40] != b"data"
    {
        return Err(anyhow!("partial WAV has an unsupported header"));
    }

    let riff_size = (length as u32).saturating_sub(8);
    let data_size = (length as u32).saturating_sub(44);
    file.seek(SeekFrom::Start(4))?;
    file.write_all(&riff_size.to_le_bytes())?;
    file.seek(SeekFrom::Start(40))?;
    file.write_all(&data_size.to_le_bytes())?;
    file.flush()?;
    Ok(u64::from(data_size) / 2)
}

fn build_capture_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    tx: SyncSender<WriterMessage>,
    selected_channel: Option<usize>,
    dropped_packets: Arc<AtomicU64>,
    stream_error: Arc<Mutex<Option<String>>>,
    source_name: &'static str,
) -> Result<cpal::Stream> {
    macro_rules! build {
        ($sample:ty) => {{
            build_typed_stream::<$sample>(
                device,
                config,
                tx,
                selected_channel,
                dropped_packets,
                stream_error,
                source_name,
            )?
        }};
    }
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build!(f32),
        cpal::SampleFormat::F64 => build!(f64),
        cpal::SampleFormat::I16 => build!(i16),
        cpal::SampleFormat::I32 => build!(i32),
        cpal::SampleFormat::U16 => build!(u16),
        format => {
            return Err(anyhow!(
                "unsupported {source_name} sample format: {format:?}"
            ))
        }
    };
    Ok(stream)
}

fn build_typed_stream<T>(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    tx: SyncSender<WriterMessage>,
    selected_channel: Option<usize>,
    dropped_packets: Arc<AtomicU64>,
    stream_error: Arc<Mutex<Option<String>>>,
    source_name: &'static str,
) -> Result<cpal::Stream>
where
    T: Sample + SizedSample + Send + 'static,
    f32: FromSample<T>,
{
    let channels = config.channels() as usize;
    let channel = selected_channel.filter(|channel| *channel < channels);
    let data_callback = move |data: &[T], _: &cpal::InputCallbackInfo| {
        let mut mono = Vec::with_capacity(data.len() / channels.max(1));
        for frame in data.chunks_exact(channels) {
            let sample = if let Some(channel) = channel {
                frame[channel].to_sample::<f32>()
            } else {
                frame
                    .iter()
                    .map(|value| value.to_sample::<f32>())
                    .sum::<f32>()
                    / channels as f32
            };
            mono.push(sample);
        }
        match tx.try_send(WriterMessage::Samples {
            data: mono,
            received_at: Instant::now(),
        }) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                dropped_packets.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => {}
        }
    };
    let error_callback = move |error| {
        let message = format!("{source_name} capture error: {error}");
        log::error!("{message}");
        *stream_error.lock().unwrap() = Some(message);
    };
    Ok(device.build_input_stream(&config.clone().into(), data_callback, error_callback, None)?)
}

fn deduplicate_echo(segments: &mut Vec<MeetingSegment>) {
    let system = segments
        .iter()
        .filter(|segment| segment.source == MeetingSource::System)
        .cloned()
        .collect::<Vec<_>>();
    segments.retain(|candidate| {
        if candidate.source != MeetingSource::Microphone {
            return true;
        }
        !system.iter().any(|remote| {
            let overlaps = candidate.start_ms <= remote.end_ms + 1_000
                && remote.start_ms <= candidate.end_ms + 1_000;
            if !overlaps {
                return false;
            }
            let local = normalize_text(&candidate.text);
            let other = normalize_text(&remote.text);
            if local.is_empty() || other.is_empty() {
                return false;
            }
            let similarity = strsim::jaro_winkler(&local, &other);
            let local_tokens = local
                .split_whitespace()
                .collect::<std::collections::HashSet<_>>();
            let other_tokens = other
                .split_whitespace()
                .collect::<std::collections::HashSet<_>>();
            let contained = local_tokens.intersection(&other_tokens).count() as f64
                / local_tokens.len().max(1) as f64;
            let unique = local_tokens.difference(&other_tokens).count() as f64
                / local_tokens.len().max(1) as f64;
            similarity >= 0.90 || (contained >= 0.85 && unique <= 0.20)
        })
    });
}

fn normalize_text(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || character.is_whitespace() {
                character
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn format_timestamp(milliseconds: i64) -> String {
    let total_seconds = milliseconds.max(0) / 1_000;
    format!(
        "{:02}:{:02}:{:02}",
        total_seconds / 3_600,
        (total_seconds % 3_600) / 60,
        total_seconds % 60
    )
}

fn macos_meeting_version_supported(version: &str) -> bool {
    let mut parts = version
        .split('.')
        .filter_map(|part| part.parse::<u32>().ok());
    match (parts.next(), parts.next()) {
        (Some(major), Some(minor)) => major > 14 || (major == 14 && minor >= 7),
        (Some(major), None) => major > 14,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn segment(source: MeetingSource, start: i64, end: i64, text: &str) -> MeetingSegment {
        MeetingSegment {
            id: 0,
            meeting_id: 1,
            source,
            start_ms: start,
            end_ms: end,
            text: text.to_string(),
        }
    }

    #[test]
    fn macos_runtime_gate_accepts_14_7_and_newer() {
        assert!(!macos_meeting_version_supported("14.6.1"));
        assert!(macos_meeting_version_supported("14.7"));
        assert!(macos_meeting_version_supported("15.0"));
    }

    #[test]
    fn echo_dedup_removes_matching_microphone_copy() {
        let mut segments = vec![
            segment(
                MeetingSource::System,
                1_000,
                3_000,
                "Hello from the meeting",
            ),
            segment(
                MeetingSource::Microphone,
                1_100,
                3_100,
                "hello from the meeting",
            ),
        ];
        deduplicate_echo(&mut segments);
        assert_eq!(segments.len(), 1);
        assert_eq!(segments[0].source, MeetingSource::System);
    }

    #[test]
    fn echo_dedup_preserves_distinct_overlapping_local_speech() {
        let mut segments = vec![
            segment(
                MeetingSource::System,
                1_000,
                3_000,
                "Can everybody see my screen",
            ),
            segment(
                MeetingSource::Microphone,
                1_100,
                3_100,
                "Yes I can see it clearly",
            ),
        ];
        deduplicate_echo(&mut segments);
        assert_eq!(segments.len(), 2);
    }

    #[test]
    fn interrupted_wav_header_is_repaired() {
        let unique = format!(
            "handy-meeting-recovery-{}-{}.wav",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap_or_default()
        );
        let path = std::env::temp_dir().join(unique);
        let spec = WavSpec {
            channels: 1,
            sample_rate: TARGET_SAMPLE_RATE,
            bits_per_sample: 16,
            sample_format: WavSampleFormat::Int,
        };
        {
            let mut writer = WavWriter::create(&path, spec).unwrap();
            for sample in [100i16, -100, 200, -200] {
                writer.write_sample(sample).unwrap();
            }
            writer.flush().unwrap();
            std::mem::forget(writer);
        }

        assert_eq!(repair_partial_wav(&path).unwrap(), 4);
        let mut reader = hound::WavReader::open(&path).unwrap();
        let samples = reader
            .samples::<i16>()
            .collect::<std::result::Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(samples, vec![100, -100, 200, -200]);
        fs::remove_file(path).unwrap();
    }
}
