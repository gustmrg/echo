import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { recordingsQuery, newestFirst } from '../lib/recording-query'
import RecordingCard from '../components/RecordingCard'
import Waveform from '../components/Waveform'
import { Button, IconMic } from '../components/ui'

export default function HomePage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const { data, isLoading, isError, refetch } = useQuery(recordingsQuery)
  const recordings = newestFirst(data)
  const featured = recordings.find((r) => r.status === 'transcribed')
  const filtered = recordings.filter(
    (r) =>
      (filter === 'all' || r.status === filter) &&
      (r.title ?? r.fileName).toLowerCase().includes(search.toLowerCase()),
  )

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
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter recordings"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
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
      {!isLoading && !isError && !filtered.length && (
        <div className="empty-message">
          <h2>
            {search || filter !== 'all'
              ? 'No matching thoughts.'
              : 'Your first thought belongs here.'}
          </h2>
          <p>
            {search || filter !== 'all'
              ? 'Try another title or stage.'
              : 'Record a voice note or import audio to get started.'}
          </p>
          {!search && filter === 'all' && (
            <Link to="/record" className="echo-button primary">
              New recording
            </Link>
          )}
        </div>
      )}
      {filtered.map((recording) => (
        <RecordingCard key={recording.id} recording={recording} />
      ))}
      {!isLoading && !isError && (
        <footer className="library-footer">
          <span>
            {filtered.length}{' '}
            {filtered.length === 1 ? 'recording' : 'recordings'}
          </span>
          <span>Small thoughts. Worth keeping.</span>
        </footer>
      )}
    </section>
  )
}
