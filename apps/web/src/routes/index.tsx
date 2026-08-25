import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { getRecordings } from '../api/recordings'
import type { Recording } from '../api/recordings'
import SearchBar from '../components/SearchBar'
import FilterTabs from '../components/FilterTabs'
import type { FilterTab } from '../components/FilterTabs'
import RecordingCard from '../components/RecordingCard'
import EmptyState from '../components/EmptyState'
import { Button, IconMic } from '../components/ui'

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function dateLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function groupByDate(recordings: Recording[]) {
  const groups: { label: string; recordings: Recording[] }[] = []
  const seen = new Map<string, Recording[]>()
  for (const rec of recordings) {
    const label = dateLabel(new Date(rec.createdAt))
    if (!seen.has(label)) {
      const arr: Recording[] = []
      seen.set(label, arr)
      groups.push({ label, recordings: arr })
    }
    seen.get(label)!.push(rec)
  }
  return groups
}

function matchesFilter(rec: Recording, filter: FilterTab): boolean {
  switch (filter) {
    case 'completed':  return rec.status === 'transcribed'
    case 'processing': return rec.status === 'transcribing'
    case 'pending':    return rec.status === 'pending'
    case 'failed':     return rec.status === 'failed'
    default:           return true
  }
}

export default function HomePage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')

  const { data: recordings, isLoading, isError, refetch } = useQuery({
    queryKey: ['recordings'],
    queryFn: getRecordings,
  })

  const filtered = useMemo(() => {
    if (!recordings) return []
    return recordings
      .filter(r => matchesFilter(r, filter))
      .filter(r => {
        if (!search) return true
        const title = (r.title ?? r.fileName).toLowerCase()
        return title.includes(search.toLowerCase())
      })
  }, [recordings, filter, search])

  const groups = useMemo(() => groupByDate(filtered), [filtered])

  const isEmpty = !isLoading && !isError && groups.length === 0

  return (
    <div className="flex flex-col h-full animate-fade-in-up">
      {/* Header */}
      <div className="px-5 md:px-8 pt-6 pb-5 flex-shrink-0 flex items-end justify-between">
        <div>
          <h1 className="font-display text-[32px] leading-none tracking-[-0.02em] text-text-primary mb-1.5">
            Echo
          </h1>
          <p className="text-sm text-text-tertiary">Your recordings</p>
        </div>
        <Link to="/record" className="hidden md:block">
          <Button className="py-2.5">
            <IconMic size={16} strokeWidth={2.5} />
            New recording
          </Button>
        </Link>
      </div>

      <SearchBar value={search} onChange={setSearch} />
      <FilterTabs active={filter} onChange={setFilter} />

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto px-5 md:px-8 pb-4">
        {isLoading && (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[68px] bg-surface rounded-md animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <p className="text-sm text-text-secondary">Failed to load recordings.</p>
            <Button variant="secondary" onClick={() => refetch()} className="px-4 py-2 text-sm">
              Try again
            </Button>
          </div>
        )}

        {isEmpty && (
          <EmptyState
            message={
              search || filter !== 'all'
                ? 'No recordings match your search.'
                : 'No recordings yet. Tap the mic to start.'
            }
          />
        )}

        {groups.map(({ label, recordings: recs }) => (
          <div key={label} className="mb-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-2.5">
              {label}
            </div>
            {recs.map((rec, idx) => (
              <RecordingCard
                key={rec.id}
                recording={rec}
                style={{ animationDelay: `${idx * 60}ms` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
