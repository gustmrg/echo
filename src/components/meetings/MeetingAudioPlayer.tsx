import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";

interface MeetingAudioPlayerProps {
  microphoneSrc: string;
  systemSrc: string;
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
};

export const MeetingAudioPlayer: React.FC<MeetingAudioPlayerProps> = ({
  microphoneSrc,
  systemSrc,
}) => {
  const { t } = useTranslation();
  const microphoneRef = useRef<HTMLAudioElement>(null);
  const systemRef = useRef<HTMLAudioElement>(null);
  const animationRef = useRef<number>();
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [systemMuted, setSystemMuted] = useState(false);

  const tick = useCallback(() => {
    const microphone = microphoneRef.current;
    const system = systemRef.current;
    if (!microphone || !system) return;
    if (Math.abs(microphone.currentTime - system.currentTime) > 0.08) {
      system.currentTime = microphone.currentTime;
    }
    setCurrentTime(microphone.currentTime);
    if (!microphone.paused) animationRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(
    () => () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  const togglePlayback = async () => {
    const microphone = microphoneRef.current;
    const system = systemRef.current;
    if (!microphone || !system) return;
    if (playing) {
      microphone.pause();
      system.pause();
      setPlaying(false);
      return;
    }
    system.currentTime = microphone.currentTime;
    await Promise.all([microphone.play(), system.play()]);
    setPlaying(true);
    animationRef.current = requestAnimationFrame(tick);
  };

  const seek = (value: number) => {
    if (microphoneRef.current) microphoneRef.current.currentTime = value;
    if (systemRef.current) systemRef.current.currentTime = value;
    setCurrentTime(value);
  };

  return (
    <div className="rounded-lg border border-mid-gray/20 bg-mid-gray/5 p-3 space-y-2">
      <audio
        ref={microphoneRef}
        src={microphoneSrc}
        preload="metadata"
        muted={microphoneMuted}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
      />
      <audio
        ref={systemRef}
        src={systemSrc}
        preload="metadata"
        muted={systemMuted}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlayback}
          className="text-text hover:text-logo-primary transition-colors"
          aria-label={
            playing ? t("meetings.audio.pause") : t("meetings.audio.play")
          }
        >
          {playing ? (
            <Pause size={19} fill="currentColor" />
          ) : (
            <Play size={19} fill="currentColor" />
          )}
        </button>
        <span className="text-xs tabular-nums text-text/55">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={currentTime}
          onChange={(event) => seek(Number(event.target.value))}
          className="flex-1 accent-logo-primary"
          aria-label={t("meetings.audio.timeline")}
        />
        <span className="text-xs tabular-nums text-text/55">
          {formatTime(duration)}
        </span>
      </div>
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMicrophoneMuted((muted) => !muted)}
          className={`flex items-center gap-1 rounded-full px-2 py-1 border transition-colors ${
            microphoneMuted
              ? "border-mid-gray/20 text-text/40"
              : "border-logo-primary/30 bg-logo-primary/10 text-logo-primary"
          }`}
        >
          <Mic2 size={13} />
          {t("meetings.sources.you")}
          {microphoneMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
        <button
          type="button"
          onClick={() => setSystemMuted((muted) => !muted)}
          className={`flex items-center gap-1 rounded-full px-2 py-1 border transition-colors ${
            systemMuted
              ? "border-mid-gray/20 text-text/40"
              : "border-purple-400/30 bg-purple-400/10 text-purple-400"
          }`}
        >
          <Volume2 size={13} />
          {t("meetings.sources.meeting")}
          {systemMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </button>
      </div>
    </div>
  );
};
