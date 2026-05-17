import type { RecordingStatus } from '../api/recordings'

const config: Record<RecordingStatus, { label: string; dot: string; text: string; pulse?: boolean }> = {
  pending:     { label: 'Pending',    dot: 'bg-text-tertiary', text: 'text-text-tertiary' },
  uploaded:    { label: 'Processing', dot: 'bg-warning',       text: 'text-warning', pulse: true },
  transcribing:{ label: 'Processing', dot: 'bg-warning',       text: 'text-warning', pulse: true },
  transcribed: { label: 'Completed',  dot: 'bg-success',       text: 'text-success' },
  failed:      { label: 'Failed',     dot: 'bg-accent',        text: 'text-accent' },
}

export default function StatusBadge({ status }: { status: RecordingStatus }) {
  const { label, dot, text, pulse } = config[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot} ${pulse ? 'animate-pulse-dot' : ''}`} />
      {label}
    </span>
  )
}
