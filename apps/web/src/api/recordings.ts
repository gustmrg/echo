import { apiFetch } from './client'

export type RecordingStatus = 'pending' | 'transcribing' | 'transcribed' | 'failed'

export interface RecordingSummary {
  id: string
  title: string | null
  status: RecordingStatus
  fileName: string
  fileSizeBytes: number
  contentType: string | null
  transcriptRevision: number
  failureReason: string | null
  attemptCount: number
  retryCount: number
  createdAt: string
  updatedAt: string | null
}

export interface Recording extends RecordingSummary {
  transcribedText: string | null
  editedText: string | null
}

export interface PagedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
}

export interface GetRecordingsParams {
  page?: number
  pageSize?: number
  status?: RecordingStatus
  q?: string
}

export function getRecordings(
  params?: GetRecordingsParams,
): Promise<PagedResponse<RecordingSummary>> {
  const search = new URLSearchParams()
  if (params?.page !== undefined) search.set('page', String(params.page))
  if (params?.pageSize !== undefined)
    search.set('pageSize', String(params.pageSize))
  if (params?.status) search.set('status', params.status)
  if (params?.q?.trim()) search.set('q', params.q.trim())
  const qs = search.toString()
  return apiFetch<PagedResponse<RecordingSummary>>(
    qs ? `/recordings?${qs}` : '/recordings',
  )
}

export function getRecording(id: string): Promise<Recording> {
  return apiFetch<Recording>(`/recordings/${id}`)
}

export function createRecording(file: File, requestKey: string): Promise<Recording> {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<Recording>('/recordings', { method: 'POST', body: form, headers: { 'Idempotency-Key': requestKey } })
}

export function deleteRecording(id: string): Promise<void> {
  return apiFetch<void>(`/recordings/${id}`, { method: 'DELETE' })
}

export function saveTranscript(id: string, text: string, expectedRevision: number): Promise<Recording> {
  return apiFetch(`/recordings/${id}/transcript`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, expectedRevision }),
  })
}

export function retryTranscription(id: string, expectedRetryCount: number): Promise<Recording> {
  return apiFetch(`/recordings/${id}/retry`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRetryCount }),
  })
}
