import { queryOptions } from '@tanstack/react-query'
import { getRecordings } from '../api/recordings'
import type { Recording } from '../api/recordings'

export const recordingsQuery = queryOptions({
  queryKey: ['recordings'],
  queryFn: getRecordings,
  refetchInterval: (query) =>
    query.state.data?.some(
      (r) => r.status === 'pending' || r.status === 'transcribing',
    )
      ? 3000
      : false,
})
export function newestFirst(recordings: Recording[] = []) {
  return [...recordings].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}
