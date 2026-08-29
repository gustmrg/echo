import { DatabaseSync, type StatementResultingChanges } from 'node:sqlite'
import {
  StoreStateConflictError,
  type JobStatus,
  type Recording,
  type RecordingStatus,
  type Store,
  type TranscriptionJob,
} from './store.js'

const MAX_FAILURE_REASON_LENGTH = 2_048
const DEFAULT_BUSY_TIMEOUT_MS = 5_000

const recordingStatuses = new Set<RecordingStatus>([
  'pending',
  'transcribing',
  'transcribed',
  'failed',
])
const jobStatuses = new Set<JobStatus>(['created', 'processing', 'completed', 'failed'])

export interface SqliteStoreOptions {
  processingLeaseMs: number
  busyTimeoutMs?: number
  now?: () => Date
}

export class SqliteStore implements Store {
  readonly #database: DatabaseSync
  readonly #processingLeaseMs: number
  readonly #now: () => Date

  constructor(databasePath: string, options: SqliteStoreOptions) {
    if (!databasePath.trim()) {
      throw new TypeError('databasePath is required')
    }
    if (!Number.isSafeInteger(options.processingLeaseMs) || options.processingLeaseMs <= 0) {
      throw new TypeError('processingLeaseMs must be a positive integer')
    }

    this.#processingLeaseMs = options.processingLeaseMs
    this.#now = options.now ?? (() => new Date())
    this.#database = new DatabaseSync(databasePath, {
      enableForeignKeyConstraints: true,
      timeout: options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS,
    })
    this.#database.exec('PRAGMA journal_mode = WAL;')
  }

  async claimNextJob(signal: AbortSignal): Promise<TranscriptionJob | null> {
    signal.throwIfAborted()

    return this.#transaction(() => {
      const now = this.#now()
      const leaseCutoff = new Date(now.getTime() - this.#processingLeaseMs)
      const candidate = this.#database.prepare(`
        SELECT j.id
        FROM transcription_jobs AS j
        INNER JOIN recordings AS r ON r.id = j.recording_id
        WHERE
          (j.status = 'created' AND r.status = 'pending')
          OR (
            j.status = 'processing'
            AND r.status = 'transcribing'
            AND julianday(j.updated_at) <= julianday(?)
          )
        ORDER BY j.created_at ASC, j.id ASC
        LIMIT 1
      `).get(leaseCutoff.toISOString())

      if (candidate === undefined) {
        return null
      }

      signal.throwIfAborted()
      const jobId = readString(candidate, 'id')
      const updatedAt = now.toISOString()
      const jobUpdate = this.#database.prepare(`
        UPDATE transcription_jobs
        SET status = 'processing', updated_at = ?, failure_reason = NULL
        WHERE id = ?
      `).run(updatedAt, jobId)
      requireOneChange(jobUpdate, `Could not claim transcription job ${jobId}`)

      const recordingUpdate = this.#database.prepare(`
        UPDATE recordings
        SET status = 'transcribing', updated_at = ?
        WHERE id = (SELECT recording_id FROM transcription_jobs WHERE id = ?)
      `).run(updatedAt, jobId)
      requireOneChange(recordingUpdate, `Could not mark the recording for job ${jobId} as transcribing`)

      return this.#getJob(jobId)
    })
  }

  async getRecording(id: string, signal: AbortSignal): Promise<Recording | null> {
    signal.throwIfAborted()

    const row = this.#database.prepare(`
      SELECT
        id,
        title,
        status,
        file_name AS fileName,
        file_size_bytes AS fileSizeBytes,
        content_type AS contentType,
        storage_key AS storageKey,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM recordings
      WHERE id = ?
    `).get(id)

    return row === undefined ? null : mapRecording(row)
  }

  async completeJob(
    job: TranscriptionJob,
    transcript: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted()

    this.#transaction(() => {
      const updatedAt = this.#now().toISOString()
      const jobUpdate = this.#database.prepare(`
        UPDATE transcription_jobs
        SET status = 'completed', updated_at = ?, failure_reason = NULL
        WHERE id = ? AND recording_id = ? AND status = 'processing'
      `).run(updatedAt, job.id, job.recordingId)
      requireOneChange(jobUpdate, `Transcription job ${job.id} is no longer processing`)

      signal.throwIfAborted()
      const recordingUpdate = this.#database.prepare(`
        UPDATE recordings
        SET status = 'transcribed', transcribed_text = ?, updated_at = ?
        WHERE id = ? AND status = 'transcribing'
      `).run(transcript, updatedAt, job.recordingId)
      requireOneChange(
        recordingUpdate,
        `Recording ${job.recordingId} is no longer transcribing`,
      )
    })
  }

  async failJob(
    job: TranscriptionJob,
    reason: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted()

    this.#transaction(() => {
      const updatedAt = this.#now().toISOString()
      const boundedReason = reason.trim().slice(0, MAX_FAILURE_REASON_LENGTH) ||
        'Unknown transcription failure'
      const jobUpdate = this.#database.prepare(`
        UPDATE transcription_jobs
        SET
          status = 'failed',
          failure_reason = ?,
          retry_count = retry_count + 1,
          updated_at = ?
        WHERE id = ? AND recording_id = ? AND status = 'processing'
      `).run(boundedReason, updatedAt, job.id, job.recordingId)
      requireOneChange(jobUpdate, `Transcription job ${job.id} is no longer processing`)

      signal.throwIfAborted()
      const recordingUpdate = this.#database.prepare(`
        UPDATE recordings
        SET status = 'failed', updated_at = ?
        WHERE id = ? AND status = 'transcribing'
      `).run(updatedAt, job.recordingId)
      requireOneChange(
        recordingUpdate,
        `Recording ${job.recordingId} is no longer transcribing`,
      )
    })
  }

  async close(): Promise<void> {
    if (this.#database.isOpen) {
      this.#database.close()
    }
  }

  #getJob(id: string): TranscriptionJob {
    const row = this.#database.prepare(`
      SELECT
        id,
        recording_id AS recordingId,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt,
        retry_count AS retryCount,
        failure_reason AS failureReason
      FROM transcription_jobs
      WHERE id = ?
    `).get(id)

    if (row === undefined) {
      throw new StoreStateConflictError(`Transcription job ${id} disappeared while claiming it`)
    }

    return mapJob(row)
  }

  #transaction<T>(action: () => T): T {
    this.#database.exec('BEGIN IMMEDIATE')
    try {
      const result = action()
      this.#database.exec('COMMIT')
      return result
    } catch (error) {
      if (this.#database.isTransaction) {
        this.#database.exec('ROLLBACK')
      }
      throw error
    }
  }
}

function requireOneChange(result: StatementResultingChanges, message: string): void {
  if (result.changes !== 1 && result.changes !== 1n) {
    throw new StoreStateConflictError(message)
  }
}

function mapRecording(row: Record<string, unknown>): Recording {
  return {
    id: readString(row, 'id'),
    title: readNullableString(row, 'title'),
    status: readRecordingStatus(row, 'status'),
    fileName: readString(row, 'fileName'),
    fileSizeBytes: readNumber(row, 'fileSizeBytes'),
    contentType: readNullableString(row, 'contentType'),
    storageKey: readNullableString(row, 'storageKey'),
    createdAt: readDate(row, 'createdAt'),
    updatedAt: readNullableDate(row, 'updatedAt'),
  }
}

function mapJob(row: Record<string, unknown>): TranscriptionJob {
  return {
    id: readString(row, 'id'),
    recordingId: readString(row, 'recordingId'),
    status: readJobStatus(row, 'status'),
    createdAt: readDate(row, 'createdAt'),
    updatedAt: readNullableDate(row, 'updatedAt'),
    retryCount: readNumber(row, 'retryCount'),
    failureReason: readNullableString(row, 'failureReason'),
  }
}

function readString(row: Record<string, unknown>, column: string): string {
  const value = row[column]
  if (typeof value !== 'string') {
    throw new TypeError(`Expected ${column} to be a string`)
  }
  return value
}

function readNullableString(row: Record<string, unknown>, column: string): string | null {
  const value = row[column]
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new TypeError(`Expected ${column} to be a string or null`)
  }
  return value
}

function readNumber(row: Record<string, unknown>, column: string): number {
  const value = row[column]
  if (typeof value !== 'number') {
    throw new TypeError(`Expected ${column} to be a number`)
  }
  return value
}

function readRecordingStatus(
  row: Record<string, unknown>,
  column: string,
): RecordingStatus {
  const value = readString(row, column)
  if (!recordingStatuses.has(value as RecordingStatus)) {
    throw new TypeError(`Unknown recording status '${value}'`)
  }
  return value as RecordingStatus
}

function readJobStatus(row: Record<string, unknown>, column: string): JobStatus {
  const value = readString(row, column)
  if (!jobStatuses.has(value as JobStatus)) {
    throw new TypeError(`Unknown job status '${value}'`)
  }
  return value as JobStatus
}

function readDate(row: Record<string, unknown>, column: string): Date {
  const value = readString(row, column)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Expected ${column} to contain a valid date`)
  }
  return date
}

function readNullableDate(row: Record<string, unknown>, column: string): Date | null {
  return row[column] === null ? null : readDate(row, column)
}
