import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useBlocker } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { createRecording } from '../api/recordings'
import { formatDuration } from '../lib/format'
import { Button, IconMic, IconUpload, Spinner } from '../components/ui'

const MAX_SECONDS = 30 * 60 // 30-minute cap (F1)
const MAX_FILE_BYTES = 25 * 1024 * 1024 // matches the API's 25 MB limit
const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.webm', '.ogg']

function extensionForMime(mime: string): string {
  const subtype = mime.split('/')[1]?.split(';')[0].trim()
  switch (subtype) {
    case 'webm':
      return 'webm'
    case 'mpeg':
    case 'mp3':
      return 'mp3'
    case 'wav':
    case 'x-wav':
      return 'wav'
    case 'mp4':
    case 'x-m4a':
      return 'm4a'
    case 'ogg':
      return 'ogg'
    default:
      return 'webm'
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
  const { state, elapsedSeconds, levels, start, pause, resume, stop, discard } =
    useAudioRecorder()
  const [micError, setMicError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [capReached, setCapReached] = useState(false)
  const [draft, setDraft] = useState<{ file: File; key: string } | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const finishing = useRef(false)
  useBlocker({
    shouldBlockFn: () =>
      (draft !== null || state !== 'idle') &&
      !window.confirm('Discard this unsaved audio and leave?'),
    enableBeforeUnload: draft !== null || state !== 'idle',
  })
  const fileInput = useRef<HTMLInputElement | null>(null)

  const {
    mutate: upload,
    isPending: isUploading,
    error: uploadError,
  } = useMutation({
    mutationFn: (draft: { file: File; key: string }) =>
      createRecording(draft.file, draft.key),
    onSuccess: (recording) => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      navigate({
        to: '/recordings/$recordingId',
        params: { recordingId: recording.id },
        ignoreBlocker: true,
      })
    },
  })

  const finishAndUpload = useCallback(
    async (autoStopped = false) => {
      if (finishing.current) return
      finishing.current = true
      setFinalizing(true)
      try {
        const blob = await stop()
        if (autoStopped) setCapReached(true)
        const ext = extensionForMime(blob.type)
        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, 19)
        const file = new File([blob], `recording-${stamp}.${ext}`, {
          type: blob.type || 'audio/webm',
        })
        const pending = { file, key: crypto.randomUUID() }
        setDraft(pending)
        const problem = validateImport(file)
        if (problem) setImportError(problem)
        else upload(pending)
      } catch {
        setMicError('Could not finalize the recording. Please try again.')
        finishing.current = false
      } finally {
        setFinalizing(false)
      }
    },
    [stop, upload],
  )

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
        setMicError(
          'Microphone access denied. Please allow microphone access and try again.',
        )
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

  return (
    <div className="studio-page capture-page">
      <div className="capture-studio">
        <p className="eyebrow">A space to think out loud</p>
        <h1>What’s on your mind?</h1>
        <p className="intro-copy">
          Let the words come as they are. You can give them shape later.
        </p>
        <div className="capture-circle" aria-hidden="true">
          {isActive ? (
            <div className="live-levels">
              {levels.map((level, i) => (
                <span
                  key={i}
                  style={{ height: `${Math.max(8, level * 100)}%` }}
                />
              ))}
            </div>
          ) : (
            <IconMic size={42} />
          )}
        </div>
        <div className="capture-time">{formatDuration(elapsedSeconds)}</div>
        <p className="capture-status" role="status">
          {isUploading
            ? 'Uploading your audio…'
            : finalizing
              ? 'Finishing your recording…'
              : isRecording
                ? 'Recording your thoughts…'
                : state === 'paused'
                  ? 'Paused. Take your time.'
                  : 'Ready when you are.'}
        </p>
        <div className="capture-controls">
          {!draft && (
            <Button
              onClick={handlePrimaryBtn}
              disabled={isUploading || finalizing}
            >
              <IconMic size={16} />
              {isRecording
                ? 'Pause recording'
                : state === 'paused'
                  ? 'Resume recording'
                  : 'Start recording'}
            </Button>
          )}
          {isActive && (
            <>
              <Button
                variant="secondary"
                onClick={() => void finishAndUpload()}
                disabled={isUploading || finalizing || !!draft}
              >
                Finish and upload
              </Button>
              <Button
                variant="ghost"
                onClick={handleDiscard}
                disabled={finalizing || isUploading}
              >
                Discard recording
              </Button>
            </>
          )}
          {isUploading && <Spinner />}
        </div>
        <p className="capture-status">
          Up to {formatDuration(MAX_SECONDS)} per recording
        </p>
        {capReached && (
          <p>Maximum length reached. Your audio is ready to upload.</p>
        )}
        {micError && (
          <p role="alert" className="error-message">
            {micError}
          </p>
        )}
        {importError && (
          <p role="alert" className="error-message">
            {importError}
          </p>
        )}
        {uploadError && (
          <p role="alert" className="error-message">
            {uploadError.message || 'Upload failed. Please try again.'}
          </p>
        )}
        {draft && !isUploading && (
          <div className="recovery-panel">
            <p>
              Your audio is retained in this tab until you upload or discard it.
            </p>
            <div className="recovery-actions">
              <Button
                onClick={() => upload(draft)}
                disabled={!!validateImport(draft.file)}
              >
                Retry upload
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const url = URL.createObjectURL(draft.file)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = draft.file.name
                  link.click()
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                }}
              >
                Download audio
              </Button>
              <Button variant="ghost" onClick={handleDiscard}>
                Discard audio
              </Button>
            </div>
          </div>
        )}
        {!isActive && !draft && (
          <div className="capture-import">
            <p>Already have something recorded?</p>
            <Button
              variant="secondary"
              onClick={handleImportClick}
              disabled={isUploading || finalizing}
            >
              <IconUpload size={16} />
              Import an audio file
            </Button>
            <p>MP3, WAV, M4A, WebM or OGG · max 25 MB</p>
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
    </div>
  )
}
