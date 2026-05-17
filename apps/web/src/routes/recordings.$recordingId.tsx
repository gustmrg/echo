import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getRecording, deleteRecording } from '../api/recordings'
import StatusBadge from '../components/StatusBadge'

function formatContentType(contentType: string | null | undefined): string {
  if (!contentType) return '—'
  const subtype = contentType.split('/')[1] ?? contentType
  return subtype.toUpperCase().split(';')[0].trim()
}

export default function ReviewPage() {
  const { recordingId } = useParams({ from: '/recordings/$recordingId' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: recording, isLoading, isError } = useQuery({
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

  return (
    <div className="flex flex-col h-full bg-bg">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-3.5 flex-shrink-0">
        <button
          onClick={() => navigate({ to: '/' })}
          className="flex items-center gap-1.5 text-sm font-medium text-text-secondary active:text-text-primary transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <span className="font-display text-lg text-text-primary">Review</span>
        <button
          onClick={() => remove()}
          disabled={isDeleting || isLoading}
          aria-label="Delete recording"
          className="text-text-tertiary active:text-accent transition-colors disabled:opacity-40"
        >
          {isDeleting ? (
            <div className="w-5 h-5 border-2 border-text-tertiary border-t-accent rounded-full animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          )}
        </button>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex-1 px-6 pt-2 space-y-3">
          <div className="h-12 bg-surface rounded-md animate-pulse" />
          <div className="h-6 bg-surface rounded-md animate-pulse w-1/2" />
          <div className="h-48 bg-surface rounded-md animate-pulse mt-4" />
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-accent">Failed to load recording.</p>
        </div>
      )}

      {/* Content */}
      {recording && (
        <>
          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Info bar */}
            <div className="flex items-center gap-4 py-4 border-b border-border mb-5 flex-shrink-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-[0.08em] text-text-tertiary font-semibold">
                  Size
                </span>
                <span className="text-sm font-semibold text-text-primary tabular-nums">
                  {recording.fileSizeMegabytes}
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
            {(recording.status === 'pending' ||
              recording.status === 'uploaded' ||
              recording.status === 'transcribing') && (
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
              </div>
            )}

            {/* Transcribed */}
            {recording.status === 'transcribed' && (
              <div>
                <p className="text-base leading-[1.75] text-text-primary">
                  Transcription complete. The full transcript will appear here once the
                  transcription endpoint is available.
                </p>
                <div className="inline-flex items-center gap-2 mt-4 px-2.5 py-1.5 bg-surface border border-border rounded-sm text-[11px] text-text-tertiary">
                  <span>Confidence</span>
                  <div className="w-10 h-1 rounded-full bg-surface-hover overflow-hidden">
                    <div className="h-full w-[94%] rounded-full bg-success" />
                  </div>
                  <span className="text-success font-semibold">94%</span>
                </div>
              </div>
            )}

            {/* Failed */}
            {recording.status === 'failed' && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-accent opacity-70"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm text-text-secondary text-center">
                  Transcription failed. Please try uploading again.
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex-shrink-0 flex gap-2.5 px-6 pb-9 pt-6 bg-gradient-to-t from-bg to-transparent">
            <button
              disabled
              className="flex-1 py-4 rounded-md text-[15px] font-semibold bg-surface border border-border text-text-primary opacity-50 cursor-not-allowed active:scale-[0.97] transition-transform"
            >
              Edit
            </button>
            <button
              disabled
              className="flex-1 py-4 rounded-md text-[15px] font-semibold bg-accent text-white shadow-[0_4px_20px_rgba(232,87,58,0.3)] opacity-50 cursor-not-allowed active:scale-[0.97] transition-transform"
            >
              Refine with AI
            </button>
          </div>
        </>
      )}
    </div>
  )
}
