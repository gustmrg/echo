import { setTimeout as delay } from 'node:timers/promises'
import type { Store, TranscriptionJob } from './db/store.js'
import type { Logger } from './logging/logger.js'
import type { FileStorage } from './storage/file-storage.js'
import type { Transcriber } from './transcription/transcriber.js'

export type WaitForPoll = (milliseconds: number, signal: AbortSignal) => Promise<void>

export interface WorkerOptions {
  store: Store
  storage: FileStorage
  transcriber: Transcriber
  logger: Logger
  pollIntervalMs: number
  waitForPoll?: WaitForPoll
}

export class Worker {
  readonly #store: Store
  readonly #storage: FileStorage
  readonly #transcriber: Transcriber
  readonly #logger: Logger
  readonly #pollIntervalMs: number
  readonly #waitForPoll: WaitForPoll

  constructor(options: WorkerOptions) {
    if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs <= 0) {
      throw new TypeError('pollIntervalMs must be a positive integer')
    }

    this.#store = options.store
    this.#storage = options.storage
    this.#transcriber = options.transcriber
    this.#logger = options.logger
    this.#pollIntervalMs = options.pollIntervalMs
    this.#waitForPoll = options.waitForPoll ?? waitForPoll
  }

  async run(signal: AbortSignal): Promise<void> {
    this.#logger.info('Worker started')

    while (!signal.aborted) {
      let job: TranscriptionJob | null
      try {
        job = await this.#store.claimNextJob(signal)
      } catch (error) {
        if (signal.aborted) {
          break
        }

        this.#logger.error('Could not claim a transcription job', error)
        if (!await this.#wait(signal)) {
          break
        }
        continue
      }

      if (job === null) {
        if (!await this.#wait(signal)) {
          break
        }
        continue
      }

      await processJob(
        job,
        this.#store,
        this.#storage,
        this.#transcriber,
        this.#logger,
        signal,
      )
    }

    this.#logger.info('Worker stopped')
  }

  async #wait(signal: AbortSignal): Promise<boolean> {
    try {
      await this.#waitForPoll(this.#pollIntervalMs, signal)
      return !signal.aborted
    } catch (error) {
      if (signal.aborted) {
        return false
      }
      throw error
    }
  }
}

export async function processJob(
  job: TranscriptionJob,
  store: Store,
  storage: FileStorage,
  transcriber: Transcriber,
  logger: Logger,
  signal: AbortSignal,
): Promise<void> {
  const jobLogger = logger.child({ jobId: job.id, recordingId: job.recordingId })
  jobLogger.info('Processing transcription job')

  try {
    const recording = await store.getRecording(job.recordingId, signal)
    if (recording === null) {
      throw new JobProcessingError('Recording was not found')
    }
    if (!recording.storageKey?.trim()) {
      throw new JobProcessingError('Recording has no storage key')
    }

    const audio = await storage.openReadStream(recording.storageKey, signal)
    let transcript: string
    try {
      transcript = await transcriber.transcribe(
        audio,
        { fileName: recording.fileName, contentType: recording.contentType },
        signal,
      )
    } finally {
      audio.destroy()
    }

    await store.completeJob(job, transcript, signal)
    jobLogger.info('Transcription job completed')
  } catch (error) {
    if (signal.aborted) {
      jobLogger.info('Transcription job interrupted by shutdown')
      return
    }

    jobLogger.error('Transcription job failed', error)
    try {
      await store.failJob(job, describeFailure(error), signal)
    } catch (failureUpdateError) {
      jobLogger.error('Could not persist transcription job failure', failureUpdateError)
    }
  }
}

async function waitForPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  await delay(milliseconds, undefined, { signal })
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

class JobProcessingError extends Error {
  override readonly name = 'JobProcessingError'
}
