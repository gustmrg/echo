export type RecordingStatus = 'pending' | 'transcribing' | 'transcribed' | 'failed'
export type JobStatus = 'created' | 'processing' | 'completed' | 'failed'

export interface Recording {
  id: string
  title: string | null
  status: RecordingStatus
  fileName: string
  fileSizeBytes: number
  contentType: string | null
  storageKey: string | null
  createdAt: Date
  updatedAt: Date | null
}

export interface TranscriptionJob {
  id: string
  recordingId: string
  status: JobStatus
  createdAt: Date
  updatedAt: Date | null
  retryCount: number
  failureReason: string | null
}

export interface Store {
  claimNextJob(signal: AbortSignal): Promise<TranscriptionJob | null>
  getRecording(id: string, signal: AbortSignal): Promise<Recording | null>
  completeJob(job: TranscriptionJob, transcript: string, signal: AbortSignal): Promise<void>
  failJob(job: TranscriptionJob, reason: string, signal: AbortSignal): Promise<void>
  close(): Promise<void>
}

export class StoreStateConflictError extends Error {
  override readonly name = 'StoreStateConflictError'
}
