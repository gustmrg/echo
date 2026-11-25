import { queryOptions } from '@tanstack/react-query'
import { getRecordings } from '../api/recordings'
import type { GetRecordingsParams, RecordingSummary } from '../api/recordings'

export const RECORDINGS_PAGE_SIZE = 20

export function recordingsListQuery(params: GetRecordingsParams = {}) {
  const normalized: GetRecordingsParams = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? RECORDINGS_PAGE_SIZE,
    ...(params.status ? { status: params.status } : {}),
    ...(params.q?.trim() ? { q: params.q.trim() } : {}),
  }

  return queryOptions({
    queryKey: ['recordings', 'list', normalized] as const,
    queryFn: () => getRecordings(normalized),
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (r) => r.status === 'pending' || r.status === 'transcribing',
      )
        ? 3000
        : false,
  })
}

export const recordingsQuery = recordingsListQuery()

export function newestFirst(recordings: RecordingSummary[] = []) {
  return [...recordings].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}
