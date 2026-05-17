import { apiFetch } from './client'

export type RecordingStatus = 'pending' | 'uploaded' | 'transcribing' | 'transcribed' | 'failed'

export interface Recording {
  id: string
  title: string | null
  status: RecordingStatus
  fileName: string
  fileSizeBytes: string
  fileSizeMegabytes: string
  contentType: string | null
  s3Key: string | null
  createdAt: string
  updatedAt: string | null
}

export function getRecordings(): Promise<Recording[]> {
  return apiFetch<Recording[]>('/recordings')
}

export function getRecording(id: string): Promise<Recording> {
  return apiFetch<Recording>(`/recordings/${id}`)
}

export function createRecording(file: File): Promise<Recording> {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<Recording>('/recordings', { method: 'POST', body: form })
}

export function deleteRecording(id: string): Promise<void> {
  return apiFetch<void>(`/recordings/${id}`, { method: 'DELETE' })
}
