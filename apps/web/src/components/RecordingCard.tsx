import { Link } from '@tanstack/react-router'
import type { RecordingSummary } from '../api/recordings'
import StatusBadge from './StatusBadge'
import { IconMic } from './ui'
import { formatBytes, formatContentType } from '../lib/format'

export default function RecordingCard({
  recording,
}: {
  recording: RecordingSummary
}) {
  return (
    <Link
      to="/recordings/$recordingId"
      params={{ recordingId: recording.id }}
      className="recording-row"
    >
      <span className="recording-title">
        <span className="recording-icon">
          <IconMic size={17} />
        </span>
        <span>
          <strong>{recording.title ?? recording.fileName}</strong>
          <small>
            {formatContentType(recording.contentType)} ·{' '}
            {new Date(recording.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </small>
        </span>
      </span>
      <span className="recording-size">
        {formatBytes(recording.fileSizeBytes)}
      </span>
      <StatusBadge status={recording.status} />
    </Link>
  )
}
