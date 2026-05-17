import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { createRecording } from '../api/recordings'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function RecordPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, elapsedSeconds, start, pause, resume, stop, discard } = useAudioRecorder()
  const [micError, setMicError] = useState<string | null>(null)

  const { mutate: upload, isPending: isUploading, error: uploadError } = useMutation({
    mutationFn: (file: File) => createRecording(file),
    onSuccess: (recording) => {
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      navigate({ to: '/recordings/$recordingId', params: { recordingId: recording.id } })
    },
  })

  const isActive = state !== 'idle'
  const isRecording = state === 'recording'

  async function handlePrimaryBtn() {
    if (state === 'idle') {
      try {
        setMicError(null)
        await start()
      } catch {
        setMicError('Microphone access denied. Please allow microphone access and try again.')
      }
    } else if (state === 'recording') {
      pause()
    } else {
      resume()
    }
  }

  function handleDiscard() {
    discard()
    navigate({ to: '/' })
  }

  async function handleDone() {
    const blob = await stop()
    const file = new File([blob], 'recording.webm', { type: blob.type || 'audio/webm' })
    upload(file)
  }

  const label =
    state === 'idle' ? 'Tap to start recording'
    : state === 'recording' ? 'Recording…'
    : 'Paused — tap to resume'

  return (
    <div className="flex flex-col h-full bg-bg animate-fade-in-up">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-3.5 flex-shrink-0">
        <button
          onClick={isActive ? handleDiscard : () => navigate({ to: '/' })}
          className="flex items-center gap-1.5 text-sm font-medium text-text-secondary active:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span className="font-display text-lg text-text-primary">New Recording</span>
        <span className="w-[52px]" />
      </div>

      {/* Visual area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
        {/* Orb */}
        <div className="relative w-[200px] h-[200px]">
          <div
            className={`w-full h-full rounded-full border-[1.5px] transition-all duration-[600ms] ease-[var(--ease-out)] ${
              isRecording
                ? 'animate-orb-breathe border-[rgba(232,87,58,0.4)] bg-[radial-gradient(circle_at_40%_40%,rgba(232,87,58,0.35),rgba(232,87,58,0.1)_60%,transparent_70%)]'
                : 'border-[rgba(232,87,58,0.15)] bg-[radial-gradient(circle_at_40%_40%,rgba(232,87,58,0.2),rgba(232,87,58,0.05)_60%,transparent_70%)]'
            }`}
          />
          <div
            className={`absolute rounded-full border transition-all duration-[600ms] ease-[var(--ease-out)] ${
              isRecording
                ? 'animate-ring-expand inset-[-16px] border-[rgba(232,87,58,0.15)]'
                : 'inset-[-16px] border-[rgba(232,87,58,0.08)]'
            }`}
          />
        </div>

        {/* Timer */}
        <div
          className={`text-5xl font-light tabular-nums tracking-[0.04em] transition-colors duration-300 ${
            isRecording ? 'text-accent' : 'text-text-primary'
          }`}
        >
          {formatTime(elapsedSeconds)}
        </div>

        {/* Status label */}
        <p className="text-sm text-text-tertiary text-center">{label}</p>

        {/* Errors */}
        {micError && (
          <p className="text-sm text-accent text-center max-w-[260px]">{micError}</p>
        )}
        {uploadError && (
          <p className="text-sm text-accent text-center max-w-[260px]">
            Upload failed. Please try again.
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-center items-center gap-10 px-6 pt-8 pb-12 flex-shrink-0">
        {/* Discard */}
        <button
          onClick={handleDiscard}
          aria-label="Discard recording"
          style={{ visibility: isActive ? 'visible' : 'hidden' }}
          className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary active:bg-surface-hover active:scale-90 transition-all touch-manipulation"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Primary button */}
        <button
          onClick={handlePrimaryBtn}
          disabled={isUploading}
          aria-label={isRecording ? 'Pause recording' : state === 'paused' ? 'Resume recording' : 'Start recording'}
          className={`w-20 h-20 rounded-full border-2 flex items-center justify-center active:scale-90 transition-all duration-[250ms] ease-[var(--ease-spring)] disabled:opacity-50 touch-manipulation ${
            isRecording
              ? 'border-accent bg-transparent'
              : 'border-accent bg-accent shadow-[0_4px_32px_rgba(232,87,58,0.4)]'
          }`}
        >
          {isRecording ? (
            <div className="w-7 h-7 rounded-[6px] bg-accent" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Done */}
        <button
          onClick={handleDone}
          disabled={isUploading}
          aria-label="Finish and upload"
          style={{ visibility: isActive ? 'visible' : 'hidden' }}
          className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary active:bg-surface-hover active:scale-90 transition-all touch-manipulation disabled:opacity-50"
        >
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-text-tertiary border-t-text-primary rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
