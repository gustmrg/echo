import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { RecordingStatus } from '../api/recordings'
import {
  RECORDINGS_PAGE_SIZE,
  recordingsListQuery,
  recordingsQuery,
} from '../lib/recording-query'
import RecordingCard from '../components/RecordingCard'
import Waveform from '../components/Waveform'
import { Button, IconMic } from '../components/ui'

type StageFilter = 'all' | RecordingStatus

export default function HomePage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<StageFilter>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const trimmed = search.trim()
    const timer = setTimeout(
      () => setDebouncedSearch(trimmed),
      trimmed ? 150 : 0,
    )
    return () => clearTimeout(timer)
  }, [search])

  const defaultRecordings = useQuery(recordingsQuery)
  const { data, isLoading, isError, refetch } = useQuery({
    ...recordingsListQuery({
      page,
      pageSize: RECORDINGS_PAGE_SIZE,
      status: filter === 'all' ? undefined : filter,
      q: debouncedSearch || undefined,
    }),
    placeholderData: keepPreviousData,
  })

  const recordings = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const hasMore = data?.hasMore ?? false
  const totalPages = Math.max(1, Math.ceil(totalCount / RECORDINGS_PAGE_SIZE))
  const featured = defaultRecordings.data?.items.find(
    (r) => r.status === 'transcribed',
  )
  const hasActiveFilter = Boolean(debouncedSearch) || filter !== 'all'

  return (
    <section className="studio-page">
      <div className="welcome-heading">
        <div>
          <p className="eyebrow">Your personal soundboard</p>
          <h1>
            Good ideas
            <br />
            start with a voice.
          </h1>
          <p className="intro-copy">
            A thought, a conversation, a moment of clarity.
            <br />
            Give it somewhere to go.
          </p>
        </div>
        <Link to="/record" className="echo-button">
          <IconMic size={16} />
          Capture a thought
        </Link>
      </div>
      {featured && (
        <div className="continue-panel">
          <div>
            <p className="eyebrow">Pick up where you left off</p>
            <h2>{featured.title ?? featured.fileName}</h2>
            <p>Your transcript is ready for a little attention.</p>
            <Link
              to="/recordings/$recordingId"
              params={{ recordingId: featured.id }}
              className="continue-link"
            >
              Continue reviewing <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <Waveform />
        </div>
      )}
      <div className="library-toolbar">
        <h2>All recordings</h2>
        <input
          type="search"
          aria-label="Search recordings"
          placeholder="Find a thought"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
        <select
          aria-label="Filter recordings"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as StageFilter)
            setPage(1)
          }}
        >
          <option value="all">All stages</option>
          <option value="transcribed">To review</option>
          <option value="pending">Waiting</option>
          <option value="transcribing">Transcribing</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <div className="recording-columns" aria-hidden="true">
        <span>Recording</span>
        <span className="recording-size">Size</span>
        <span>Stage</span>
      </div>
      {isLoading && (
        <p className="empty-message" role="status">
          Loading your recordings…
        </p>
      )}
      {isError && (
        <div className="empty-message" role="alert">
          <p>Could not load your recordings.</p>
          <Button variant="secondary" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}
      {!isLoading && !isError && !recordings.length && (
        <div className="empty-message">
          <h2>
            {hasActiveFilter
              ? 'No matching thoughts.'
              : 'Your first thought belongs here.'}
          </h2>
          <p>
            {hasActiveFilter
              ? 'Try another title or stage.'
              : 'Record a voice note or import audio to get started.'}
          </p>
          {!hasActiveFilter && (
            <Link to="/record" className="echo-button primary">
              New recording
            </Link>
          )}
        </div>
      )}
      {recordings.map((recording) => (
        <RecordingCard key={recording.id} recording={recording} />
      ))}
      {!isLoading && !isError && (
        <footer className="library-footer">
          <span>
            {totalCount} {totalCount === 1 ? 'recording' : 'recordings'}
            {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
          </span>
          {totalPages > 1 ? (
            <div className="document-actions">
              <Button
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
          ) : (
            <span>Small thoughts. Worth keeping.</span>
          )}
        </footer>
      )}
    </section>
  )
}
