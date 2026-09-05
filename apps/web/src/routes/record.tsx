import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useBlocker } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { createRecording } from '../api/recordings'
import { formatDuration } from '../lib/format'
import { Button, IconCheck, IconClose, IconMic, IconUpload, PageHeader, Spinner } from '../components/ui'

const MAX_SECONDS = 30 * 60 // 30-minute cap (F1)
const MAX_FILE_BYTES = 25 * 1024 * 1024 // matches the API's 25 MB limit
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.webm', '.ogg']

function extensionForMime(mime: string): string {
  const subtype = mime.split('/')[1]?.split(';')[0].trim()
  switch (subtype) {
    case 'webm': return 'webm'
    case 'mpeg':
    case 'mp3': return 'mp3'
    case 'wav':
    case 'x-wav': return 'wav'
    case 'mp4':
    case 'x-m4a': return 'm4a'
    case 'ogg': return 'ogg'
    default: return 'webm'
  }
}

function validateImport(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  if (!file.type.startsWith('audio/') && !ACCEPTED_EXTENSIONS.includes(ext)) {
    return `Unsupported format "${ext}". Supported: MP3, WAV, M4A, WebM, OGG.`
  }
  if (file.size > MAX_FILE_BYTES) {
    return `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 25 MB.`
  }
  if (file.size === 0) return 'That file is empty.'
  return null
}

export default function RecordPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, elapsedSeconds, levels, start, pause, resume, stop, discard } = useAudioRecorder()
  const [micError, setMicError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [capReached, setCapReached] = useState(false)
  const [draft, setDraft] = useState<{ file: File; key: string } | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const finishing = useRef(false)
  useBlocker({
    shouldBlockFn: () => (draft !== null || state !== 'idle') && !window.confirm('Discard this unsaved audio and leave?'),
    enableBeforeUnload: draft !== null || state !== 'idle',
  })
  const fileInput = useRef<HTMLInputElement | null>(null)

  const { mutate: upload, isPending: isUploading, error: uploadError } = useMutation({
    mutationFn: (draft: { file: File; key: string }) => createRecording(draft.file, draft.key),
    onSuccess: (recording) => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      navigate({ to: '/recordings/$recordingId', params: { recordingId: recording.id }, ignoreBlocker: true })
    },
  })

  const finishAndUpload = useCallback(async (autoStopped = false) => {
    if (finishing.current) return
    finishing.current = true
    setFinalizing(true)
    try {
      const blob = await stop()
      if (autoStopped) setCapReached(true)
      const ext = extensionForMime(blob.type)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const file = new File([blob], `recording-${stamp}.${ext}`, { type: blob.type || 'audio/webm' })
      const pending = { file, key: crypto.randomUUID() }
      setDraft(pending)
      const problem = validateImport(file)
      if (problem) setImportError(problem)
      else upload(pending)
    } catch {
      setMicError('Could not finalize the recording. Please try again.')
      finishing.current = false
    } finally { setFinalizing(false) }
  }, [stop, upload])

  // Auto-stop at the 30-minute cap
  useEffect(() => {
    if (state !== 'recording' || elapsedSeconds < MAX_SECONDS) return
    const t = setTimeout(() => void finishAndUpload(true), 0)
    return () => clearTimeout(t)
  }, [elapsedSeconds, state, finishAndUpload])

  const isActive = state !== 'idle'
  const isRecording = state === 'recording'

  async function handlePrimaryBtn() {
    if (state === 'idle') {
      try {
        setMicError(null)
        setImportError(null)
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
    setDraft(null)
    finishing.current = false
    navigate({ to: '/', ignoreBlocker: true })
  }

  function handleImportClick() {
    setImportError(null)
    fileInput.current?.click()
  }

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const problem = validateImport(file)
    if (problem) {
      setImportError(problem)
      return
    }
    const pending = { file, key: crypto.randomUUID() }
    setDraft(pending)
    upload(pending)
  }

  const label =
    state === 'idle' ? 'Tap to start recording'
    : state === 'recording' ? 'Recording… tap to pause'
    : 'Paused — tap to resume'

  return (
    <div className="flex flex-col h-full bg-bg animate-fade-in-up">
      <PageHeader title="New Recording" onBack={() => (isActive ? handleDiscard() : navigate({ to: '/' }))} />

      {/* Visual area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-7 px-6 py-4">
        {/* Orb */}
        <div className="relative w-[180px] h-[180px]">
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

        {/* Live input levels */}
        <div className="flex items-end gap-[3px] h-10" aria-hidden>
          {levels.map((level, i) => (
            <div
              key={i}
              className={`w-[3px] rounded-full transition-colors duration-300 ${
                isRecording ? 'bg-accent' : 'bg-border'
              }`}
              style={{ height: `${Math.max(8, level * 100)}%` }}
            />
          ))}
        </div>

        {/* Timer */}
        <div className="text-center">
          <div
            className={`text-5xl font-light tabular-nums tracking-[0.04em] transition-colors duration-300 ${
              isRecording ? 'text-accent' : 'text-text-primary'
            }`}
          >
            {formatDuration(elapsedSeconds)}
          </div>
          <div className="text-xs text-text-tertiary tabular-nums mt-1.5">
            up to {formatDuration(MAX_SECONDS)}
          </div>
        </div>

        {/* Status label */}
        <p className="text-sm text-text-tertiary text-center">{label}</p>

        {/* Notices & errors */}
        {capReached && (
          <p className="text-sm text-warning text-center max-w-[300px]">
            Maximum length reached — uploading your recording.
          </p>
        )}
        {micError && (
          <p className="text-sm text-accent text-center max-w-[300px]">{micError}</p>
        )}
        {importError && (
          <p className="text-sm text-accent text-center max-w-[300px]">{importError}</p>
        )}
        {uploadError && (
          <p className="text-sm text-accent text-center max-w-[300px]">
            {uploadError.message || 'Upload failed. Please try again.'}
          </p>
        )}

        {draft && !isUploading && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-text-secondary">Your audio is retained until you upload or discard it.</p>
            <Button onClick={() => upload(draft)} disabled={!!validateImport(draft.file)}>Retry upload</Button>
            <Button variant="secondary" onClick={() => {
              const url = URL.createObjectURL(draft.file)
              const link = document.createElement('a')
              link.href = url; link.download = draft.file.name; link.click()
              setTimeout(() => URL.revokeObjectURL(url), 1000)
            }}>Download audio</Button>
            <Button variant="ghost" onClick={handleDiscard}>Discard audio</Button>
          </div>
        )}
        {/* File import (idle only) */}
        {!isActive && !draft && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <div className="flex items-center gap-3 w-[220px]">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] uppercase tracking-[0.08em] text-text-tertiary">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <Button variant="secondary" onClick={handleImportClick} disabled={isUploading || finalizing || draft !== null} className="py-2.5 text-sm">
              {isUploading ? <Spinner className="w-4 h-4" /> : <IconUpload size={16} />}
              Import an audio file
            </Button>
            <p className="text-[11px] text-text-tertiary">MP3, WAV, M4A, WebM or OGG · max 25 MB</p>
            <input
              ref={fileInput}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
              className="hidden"
              onChange={handleFilePicked}
            />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex justify-center items-center gap-10 px-6 pt-6 pb-6 flex-shrink-0">
        {/* Discard */}
        <button
          onClick={handleDiscard}
          disabled={finalizing || isUploading}
          aria-label="Discard recording"
          style={{ visibility: isActive ? 'visible' : 'hidden' }}
          className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover active:scale-90 transition-all touch-manipulation"
        >
          <IconClose />
        </button>

        {/* Primary button */}
        <button
          onClick={handlePrimaryBtn}
          disabled={isUploading || finalizing || draft !== null}
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
            <IconMic size={28} strokeWidth={2.5} className="text-white" />
          )}
        </button>

        {/* Done */}
        <button
          onClick={() => void finishAndUpload()}
          disabled={isUploading || finalizing || draft !== null}
          aria-label="Finish and upload"
          style={{ visibility: isActive ? 'visible' : 'hidden' }}
          className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center text-text-secondary hover:bg-surface-hover active:scale-90 transition-all touch-manipulation disabled:opacity-50"
        >
          {isUploading ? <Spinner className="w-4 h-4" /> : <IconCheck />}
        </button>
      </div>
    </div>
  )
}
