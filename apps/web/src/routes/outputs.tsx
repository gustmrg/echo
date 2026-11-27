import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getOutputs } from '../api/refinements'
import { FORMAT_LABELS } from '../lib/formats'
import { Button, Spinner } from '../components/ui'

const OUTPUTS_PAGE_SIZE = 20

export default function OutputsPage() {
  const [page, setPage] = useState(0)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['outputs', { page: page + 1, pageSize: OUTPUTS_PAGE_SIZE }],
    queryFn: () => getOutputs({ page: page + 1, pageSize: OUTPUTS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.hasActiveJobs ? 1000 : false,
  })

  const outputs = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const hasMore = data?.hasMore ?? false
  const pages = Math.max(1, Math.ceil(totalCount / OUTPUTS_PAGE_SIZE))

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
      {isLoading && (
        <div className="document-message" role="status">
          <Spinner />
          Loading outputs…
        </div>
      )}
      {isError && (
        <div className="document-message" role="alert">
          <p>Some outputs could not be loaded.</p>
          <Button onClick={() => void refetch()}>Try again</Button>
        </div>
      )}
      {outputs.map((output) => (
        <Link
          key={output.id}
          to="/recordings/$recordingId/refine"
          params={{ recordingId: output.recordingId }}
          search={{ format: output.format }}
          className="recording-row"
        >
          <span className="recording-title">
            <span>
              <strong>
                {output.recordingTitle ?? output.recordingFileName}
              </strong>
              <small>{FORMAT_LABELS[output.format]}</small>
            </span>
          </span>
          <span className="recording-size">
            {output.wordCount.toLocaleString()}{' '}
            {output.wordCount === 1 ? 'word' : 'words'}
          </span>
          <span className="text-success text-xs">Open →</span>
        </Link>
      ))}
      {!isLoading && !isError && outputs.length === 0 && (
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
          {pages > 1 ? ` · Page ${page + 1} of ${pages}` : ''}
        </span>
        {pages > 1 && (
          <div className="document-actions">
            <Button
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </footer>
    </div>
  )
}
