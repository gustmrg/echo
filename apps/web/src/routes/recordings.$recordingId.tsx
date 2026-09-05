import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getRecording,
  deleteRecording,
  retryTranscription,
} from '../api/recordings'
import { clearRecordingStorage } from '../lib/storage'
import WorkflowSteps from '../components/WorkflowSteps'
import StatusBadge from '../components/StatusBadge'
import TranscriptEditor from '../components/TranscriptEditor'
import {
  Button,
  ConfirmDialog,
  IconAlert,
  IconSparkle,
  IconTrash,
  Spinner,
} from '../components/ui'
import { formatBytes, formatContentType } from '../lib/format'

export default function ReviewPage() {
  const { recordingId } = useParams({ from: '/recordings/$recordingId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const {
    data: recording,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['recordings', recordingId],
    queryFn: () => getRecording(recordingId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'transcribed' || status === 'failed') return false
      return 3000
    },
  })

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteRecording(recordingId),
    onSuccess: () => {
      clearRecordingStorage(recordingId)
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      queryClient.removeQueries({ queryKey: ['recordings', recordingId] })
      navigate({ to: '/', ignoreBlocker: true })
    },
  })

  const retry = useMutation({
    mutationFn: () =>
      retryTranscription(recordingId, recording?.retryCount ?? 0),
    onSuccess: (result) => {
      queryClient.setQueryData(['recordings', recordingId], result)
    },
  })

  const isProcessing =
    recording?.status === 'pending' || recording?.status === 'transcribing'

  return (
    <div className="studio-page">
      <header className="document-heading">
        <div>
          <p className="eyebrow">Your recording</p>
          <h1>{recording?.title ?? recording?.fileName ?? 'Recording'}</h1>
          {recording && (
            <div className="document-meta">
              <span>{formatBytes(recording.fileSizeBytes)}</span>
              <span>{formatContentType(recording.contentType)}</span>
              <StatusBadge status={recording.status} />
            </div>
          )}
        </div>
        <div className="document-actions">
          <Button variant="ghost" onClick={() => navigate({ to: '/' })}>
            All recordings
          </Button>
          <Button
            variant="ghost"
            onClick={() => setConfirmDelete(true)}
            disabled={!recording}
            aria-label="Delete recording"
          >
            <IconTrash />
          </Button>
        </div>
      </header>
      <WorkflowSteps stage="review" />
      {isLoading && (
        <div className="document-message" role="status">
          <Spinner />
          Loading recording…
        </div>
      )}
      {isError && (
        <div className="document-message">
          <p>Failed to load recording.</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}
      {recording && (
        <div className="document-grid">
          <section className="document-paper" aria-label="Transcript review">
            <div className="paper-heading">
              <span className="eyebrow">The transcript</span>
              <span>Make it sound like you.</span>
            </div>
            {isProcessing && (
              <div className="document-message" role="status">
                <Spinner />
                <p>
                  {recording.status === 'pending'
                    ? 'Waiting to process…'
                    : 'Transcribing your recording…'}
                </p>
                <p>You can leave this page and come back.</p>
              </div>
            )}
            {recording.status === 'transcribed' &&
              (recording.transcribedText ? (
                <TranscriptEditor
                  key={recording.id}
                  recordingId={recording.id}
                  original={recording.transcribedText}
                  editedText={recording.editedText}
                  revision={recording.transcriptRevision}
                />
              ) : (
                <div className="document-message">
                  Transcription finished but returned no text. The audio may be
                  silent.
                </div>
              ))}
            {retry.error && (
              <p role="alert" className="error-message">
                {retry.error.message}
              </p>
            )}
            {recording.status === 'failed' && (
              <div className="document-message">
                <IconAlert />
                <p>
                  {recording.failureReason ??
                    'Transcription failed. You can retry using the saved audio.'}
                </p>
                <Button
                  disabled={retry.isPending}
                  onClick={() => retry.mutate()}
                >
                  Retry transcription
                </Button>
              </div>
            )}
          </section>
          <aside className="refinement-rail">
            <span className="eyebrow">Next chapter</span>
            <h2>Give it a shape.</h2>
            <p>
              Turn your reviewed words into notes, a blog post, an interview, or
              a news brief.
            </p>
            <Button
              disabled={
                recording.status !== 'transcribed' || !recording.transcribedText
              }
              onClick={() =>
                navigate({
                  to: '/recordings/$recordingId/refine',
                  params: { recordingId },
                })
              }
            >
              <IconSparkle size={16} />
              Refine with AI
            </Button>
            <p>Your edits are saved before moving on.</p>
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete recording?"
        message="This permanently deletes the recording, its transcript, and generated outputs. This can't be undone."
        loading={isDeleting}
        onConfirm={() => remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
