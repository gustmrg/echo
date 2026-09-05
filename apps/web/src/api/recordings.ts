import { apiFetch } from './client'

export type RecordingStatus = 'pending' | 'transcribing' | 'transcribed' | 'failed'

export interface Recording {
  id: string
  title: string | null
  status: RecordingStatus
  fileName: string
  fileSizeBytes: number
  contentType: string | null
  transcribedText: string | null
  editedText: string | null
  transcriptRevision: number
  failureReason: string | null
  attemptCount: number
  retryCount: number
  createdAt: string
  updatedAt: string | null
}

export function getRecordings(): Promise<Recording[]> {
  return apiFetch<Recording[]>('/recordings')
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
