import type { RecordingStatus } from '../api/recordings'

const config: Record<RecordingStatus, { label: string; dot: string; text: string; pulse?: boolean }> = {
  pending:      { label: 'Waiting',    dot: 'bg-text-tertiary', text: 'text-text-tertiary' },
  transcribing: { label: 'Transcribing', dot: 'bg-warning',       text: 'text-warning', pulse: true },
  transcribed:  { label: 'To review',  dot: 'bg-success',       text: 'text-success' },
  failed:       { label: 'Failed',     dot: 'bg-accent',        text: 'text-accent' },
}

export default function StatusBadge({ status }: { status: RecordingStatus }) {
  const { label, dot, text, pulse } = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot} ${pulse ? 'animate-pulse-dot' : ''}`} />
      {label}
    </span>
  )
}
