import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRecording, deleteRecording } from '../api/recordings'
import StatusBadge from '../components/StatusBadge'
import TranscriptEditor from '../components/TranscriptEditor'
import { Button, ConfirmDialog, IconAlert, IconSparkle, IconTrash, PageHeader } from '../components/ui'
import { formatBytes, formatContentType } from '../lib/format'

export default function ReviewPage() {
  const { recordingId } = useParams({ from: '/recordings/$recordingId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: recording, isLoading, isError, refetch } = useQuery({
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
      queryClient.invalidateQueries({ queryKey: ['recordings'] })
      queryClient.removeQueries({ queryKey: ['recordings', recordingId] })
      navigate({ to: '/' })
    },
  })

  const isProcessing = recording?.status === 'pending' || recording?.status === 'transcribing'

  return (
    <div className="flex flex-col h-full bg-bg animate-fade-in-up">
      <PageHeader
        title={recording ? (recording.title ?? recording.fileName) : 'Recording'}
        onBack={() => navigate({ to: '/' })}
        action={
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isLoading}
            aria-label="Delete recording"
            className="text-text-tertiary hover:text-accent transition-colors disabled:opacity-40"
          >
            <IconTrash />
          </button>
        }
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex-1 px-5 md:px-8 pt-4 space-y-3">
          <div className="h-12 bg-surface rounded-md animate-pulse" />
          <div className="h-6 bg-surface rounded-md animate-pulse w-1/2" />
          <div className="h-48 bg-surface rounded-md animate-pulse mt-4" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-text-secondary">Failed to load recording.</p>
          <Button variant="secondary" onClick={() => refetch()} className="px-4 py-2 text-sm">
            Try again
          </Button>
        </div>
      )}

      {/* Content */}
      {recording && (
        <>
          <div className="flex-1 overflow-y-auto px-5 md:px-8 pb-4">
            {/* Info bar */}
            <div className="flex items-center gap-4 py-4 border-b border-border mb-5 flex-shrink-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary font-semibold">
                  Size
                </span>
                <span className="text-sm font-semibold text-text-primary tabular-nums">
                  {formatBytes(recording.fileSizeBytes)}
                </span>
              </div>
              <div className="w-px h-7 bg-border flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary font-semibold">
                  Status
                </span>
                <StatusBadge status={recording.status} />
              </div>
              <div className="w-px h-7 bg-border flex-shrink-0" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary font-semibold">
                  Format
                </span>
                <span className="text-sm font-semibold text-text-primary">
                  {formatContentType(recording.contentType)}
                </span>
              </div>
            </div>

            {/* Processing */}
            {isProcessing && (
              <div className="flex flex-col items-center justify-center py-16 gap-5">
                <div className="flex items-center gap-2">
                  {[0, 300, 600].map((delay) => (
                    <span
                      key={delay}
                      className="w-2 h-2 rounded-full bg-warning animate-pulse-dot"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
                <p className="text-sm text-text-secondary text-center">
                  {recording.status === 'pending'
                    ? 'Waiting to process…'
                    : 'Transcribing your recording…'}
                </p>
                <div className="w-48 h-1 rounded-full overflow-hidden bg-surface">
                  <div className="h-full w-full bg-[linear-gradient(90deg,transparent,var(--color-warning),transparent)] bg-[length:200%_100%] animate-shimmer" />
                </div>
              </div>
            )}

            {/* Transcript editor */}
            {recording.status === 'transcribed' && (
              recording.transcribedText ? (
                <TranscriptEditor recordingId={recording.id} original={recording.transcribedText} />
              ) : (
                <p className="text-sm text-text-secondary py-8 text-center">
                  Transcription finished but returned no text. The audio may be silent.
                </p>
              )
            )}

            {/* Failed */}
            {recording.status === 'failed' && (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <IconAlert className="text-accent opacity-70" />
                <p className="text-sm text-text-secondary text-center max-w-[280px]">
                  Transcription failed. This can happen with very short or silent audio.
                </p>
                <Button variant="danger" onClick={() => setConfirmDelete(true)} className="px-4 py-2.5 text-sm">
                  Delete and try again
                </Button>
              </div>
            )}
          </div>

          {/* CTA */}
          {recording.status === 'transcribed' && recording.transcribedText && (
            <div className="flex-shrink-0 px-5 md:px-8 pb-4 pt-5 bg-gradient-to-t from-bg via-bg to-transparent">
              <Button
                className="w-full py-4"
                onClick={() =>
                  navigate({ to: '/recordings/$recordingId/refine', params: { recordingId } })
                }
              >
                <IconSparkle />
                Refine with AI
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete recording?"
        message="This permanently deletes the recording and its transcript. This can't be undone."
        loading={isDeleting}
        onConfirm={() => remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
