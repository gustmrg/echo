import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { queryOptions, useQueries, useQuery } from '@tanstack/react-query'
import { getRefinements } from '../api/refinements'
import { newestFirst, recordingsQuery } from '../lib/recording-query'
import { FORMAT_LABELS } from '../lib/formats'
import { Button, Spinner } from '../components/ui'

export default function OutputsPage() {
  const [page, setPage] = useState(0)
  const recordings = useQuery(recordingsQuery)
  const candidates = newestFirst(recordings.data).filter(
    (r) => r.status === 'transcribed',
  )
  const pages = Math.max(1, Math.ceil(candidates.length / 20))
  const currentPage = Math.min(page, pages - 1)
  const visible = candidates.slice(currentPage * 20, (currentPage + 1) * 20)
  const queries = useQueries({
    queries: visible.map((r) =>
      queryOptions({
        queryKey: ['refinements', r.id],
        queryFn: () => getRefinements(r.id),
        refetchInterval: (query) =>
          query.state.data?.some(
            (job) => job.status === 'created' || job.status === 'processing',
          )
            ? 1000
            : false,
      }),
    ),
  })
  const outputs = queries.flatMap((query, index) =>
    (query.data ?? [])
      .filter(
        (j) =>
          j.status === 'completed' &&
          j.transcriptRevision === visible[index].transcriptRevision,
      )
      .map((job) => ({ job, recording: visible[index] })),
  )
  const loading = recordings.isLoading || queries.some((q) => q.isLoading)
  const failed = recordings.isError || queries.some((q) => q.isError)
  return (
    <div className="studio-page">
      <header className="document-heading">
        <div>
          <p className="eyebrow">From thought to finished piece</p>
          <h1>Saved outputs.</h1>
          <p className="intro-copy">
            The shapes your words have taken. Open a piece to read, copy, or
            download it.
          </p>
        </div>
      </header>
      {loading && (
        <div className="document-message" role="status">
          <Spinner />
          Loading outputs…
        </div>
      )}
      {failed && (
        <div className="document-message" role="alert">
          <p>Some outputs could not be loaded.</p>
          <Button
            onClick={() => {
              void recordings.refetch()
              queries.forEach((q) => {
                if (q.isError) void q.refetch()
              })
            }}
          >
            Try again
          </Button>
        </div>
      )}
      {outputs.map(({ job, recording }) => (
        <Link
          key={job.id}
          to="/recordings/$recordingId/refine"
          params={{ recordingId: recording.id }}
          search={{ format: job.format }}
          className="recording-row"
        >
          <span className="recording-title">
            <span>
              <strong>{recording.title ?? recording.fileName}</strong>
              <small>{FORMAT_LABELS[job.format]}</small>
            </span>
          </span>
          <span className="recording-size">
            {job.content?.trim().split(/\s+/).length ?? 0} words
          </span>
          <span className="text-success text-xs">Open →</span>
        </Link>
      ))}
      {!loading && !failed && outputs.length === 0 && (
        <div className="empty-message">
          <h2>No outputs here yet.</h2>
          <p>
            Review a transcript and choose a format to create your first piece.
          </p>
          <Link to="/" className="echo-button secondary">
            Browse recordings
          </Link>
        </div>
      )}
      <footer className="library-footer">
        <span>
          Outputs from current transcript versions
          {pages > 1 ? ` · Recordings page ${currentPage + 1} of ${pages}` : ''}
        </span>
        {pages > 1 && (
          <div className="document-actions">
            <Button
              variant="ghost"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </footer>
    </div>
  )
}
