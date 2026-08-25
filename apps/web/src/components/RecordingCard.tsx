import { Link } from '@tanstack/react-router'
import type { Recording } from '../api/recordings'
import StatusBadge from './StatusBadge'
import { formatBytes, formatContentType } from '../lib/format'

interface RecordingCardProps {
  recording: Recording
  style?: React.CSSProperties
}

export default function RecordingCard({ recording, style }: RecordingCardProps) {
  const title = recording.title ?? recording.fileName

  return (
    <Link
      to="/recordings/$recordingId"
      params={{ recordingId: recording.id }}
      className="group flex items-center gap-4 bg-surface border border-border rounded-md px-4 py-3.5 mb-2.5 hover:border-border hover:bg-surface-raised active:scale-[0.99] transition-all duration-200 animate-fade-in-up"
      style={style}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-text-primary leading-snug truncate mb-1.5">
          {title}
        </div>
        <div className="flex items-center gap-2.5 text-xs text-text-tertiary">
          <StatusBadge status={recording.status} />
          <span className="tabular-nums">{formatBytes(recording.fileSizeBytes)}</span>
          <span aria-hidden>·</span>
          <span>{formatContentType(recording.contentType)}</span>
        </div>
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 text-text-tertiary group-hover:text-text-secondary group-hover:translate-x-0.5 transition-all"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  )
}
