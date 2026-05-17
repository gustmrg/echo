import { Link } from '@tanstack/react-router'
import type { Recording } from '../api/recordings'
import StatusBadge from './StatusBadge'
import Waveform from './Waveform'

function leftBorderColor(status: Recording['status']): string {
  switch (status) {
    case 'transcribed':  return 'bg-success'
    case 'uploaded':
    case 'transcribing': return 'bg-warning'
    case 'failed':       return 'bg-accent'
    default:             return 'bg-text-tertiary'
  }
}

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
      className="group block bg-surface border border-border rounded-md p-4 mb-2.5 relative overflow-hidden active:scale-[0.98] active:bg-surface-hover transition-all duration-200 animate-fade-in-up"
      style={style}
    >
      <div className={`absolute top-0 left-0 w-[3px] h-full rounded-r-sm ${leftBorderColor(recording.status)}`} />
      <div className="flex justify-between items-start mb-2">
        <span className="text-[15px] font-semibold text-text-primary leading-snug pr-3 line-clamp-2">{title}</span>
        <span className="text-xs text-text-tertiary tabular-nums whitespace-nowrap flex-shrink-0">{recording.fileSizeMegabytes}</span>
      </div>
      <div className="flex items-center gap-3">
        <StatusBadge status={recording.status} />
      </div>
      <Waveform />
    </Link>
  )
}
