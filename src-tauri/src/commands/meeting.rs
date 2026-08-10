use crate::managers::audio::AudioRecordingManager;
use crate::managers::meeting::{
    MeetingCapabilities, MeetingCaptureDevice, MeetingDetail, MeetingManager, MeetingSummary,
};
use crate::settings::{get_settings, write_settings};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

fn restore_always_on_microphone(app: &AppHandle) {
    if get_settings(app).always_on_microphone {
        let manager = app.state::<Arc<AudioRecordingManager>>().inner().clone();
        std::thread::spawn(move || {
            if let Err(error) = manager.start_microphone_stream() {
                log::warn!("Failed to restore always-on microphone after meeting: {error}");
            }
        });
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting_capabilities() -> MeetingCapabilities {
    MeetingManager::capabilities()
}

#[tauri::command]
#[specta::specta]
pub async fn get_meeting_capture_devices(
    app: AppHandle,
) -> Result<Vec<MeetingCaptureDevice>, String> {
    let manager = app.state::<Arc<MeetingManager>>().inner().clone();
    tokio::task::spawn_blocking(move || manager.capture_devices())
        .await
        .map_err(|error| format!("meeting device task failed: {error}"))?
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn set_meeting_output_device(app: AppHandle, device_id: Option<String>) -> Result<(), String> {
    let manager = app.state::<Arc<MeetingManager>>();
    if manager.is_busy() {
        return Err("cannot change the output device during a meeting".to_string());
    }
    let mut settings = get_settings(&app);
    settings.meeting_output_device_id = device_id.filter(|id| !id.is_empty());
    write_settings(&app, settings);
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting_output_device(app: AppHandle) -> Option<String> {
    get_settings(&app).meeting_output_device_id
}

#[tauri::command]
#[specta::specta]
pub async fn start_meeting(app: AppHandle) -> Result<MeetingSummary, String> {
    let audio = app.state::<Arc<AudioRecordingManager>>().inner().clone();
    if audio.is_recording() {
        return Err("stop the current dictation before starting a meeting".to_string());
    }
    audio.stop_microphone_stream();
    let manager = app.state::<Arc<MeetingManager>>().inner().clone();
    let result = tokio::task::spawn_blocking(move || manager.start())
        .await
        .map_err(|error| format!("meeting start task failed: {error}"))?
        .map_err(|error| error.to_string());
    if result.is_err() {
        restore_always_on_microphone(&app);
    }
    result
}

#[tauri::command]
#[specta::specta]
pub async fn stop_meeting(app: AppHandle) -> Result<MeetingSummary, String> {
    let manager = app.state::<Arc<MeetingManager>>().inner().clone();
    let result = tokio::task::spawn_blocking(move || manager.stop())
        .await
        .map_err(|error| format!("meeting stop task failed: {error}"))?
        .map_err(|error| error.to_string());
    restore_always_on_microphone(&app);
    result
}

#[tauri::command]
#[specta::specta]
pub async fn cancel_meeting(app: AppHandle) -> Result<(), String> {
    let manager = app.state::<Arc<MeetingManager>>().inner().clone();
    let result = tokio::task::spawn_blocking(move || manager.cancel())
        .await
        .map_err(|error| format!("meeting cancel task failed: {error}"))?
        .map_err(|error| error.to_string());
    restore_always_on_microphone(&app);
    result
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting_state(app: AppHandle) -> Result<Option<MeetingSummary>, String> {
    app.state::<Arc<MeetingManager>>()
        .current()
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn list_meetings(
    app: AppHandle,
    offset: usize,
    limit: usize,
) -> Result<Vec<MeetingSummary>, String> {
    app.state::<Arc<MeetingManager>>()
        .list(offset, limit.min(100))
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting(app: AppHandle, id: i64) -> Result<MeetingDetail, String> {
    app.state::<Arc<MeetingManager>>()
        .get_detail(id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn retry_meeting_transcription(app: AppHandle, id: i64) -> Result<(), String> {
    app.state::<Arc<MeetingManager>>()
        .inner()
        .clone()
        .retry_transcription(id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn rename_meeting(app: AppHandle, id: i64, title: String) -> Result<MeetingSummary, String> {
    app.state::<Arc<MeetingManager>>()
        .rename(id, title)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn delete_meeting(app: AppHandle, id: i64) -> Result<(), String> {
    app.state::<Arc<MeetingManager>>()
        .delete(id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_meeting_audio_paths(app: AppHandle, id: i64) -> Result<(String, String), String> {
    app.state::<Arc<MeetingManager>>()
        .audio_paths(id)
        .map_err(|error| error.to_string())
}
