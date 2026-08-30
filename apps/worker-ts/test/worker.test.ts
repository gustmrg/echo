import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { describe, it } from 'node:test'
import type { Recording, Store, TranscriptionJob } from '../src/db/store.js'
import { createLogger } from '../src/logging/logger.js'
import type { FileStorage } from '../src/storage/file-storage.js'
import type { AudioMetadata, Transcriber } from '../src/transcription/transcriber.js'
import { processJob, Worker } from '../src/worker.js'

const abortSignal = new AbortController().signal
const job = createJob()
const recording = createRecording()

describe('processJob', () => {
  it('loads, transcribes, and atomically completes a claimed job', async () => {
    let requestedStorageKey: string | undefined
    let receivedMetadata: AudioMetadata | undefined
    let completedTranscript: string | undefined
    const store = createStore({
      getRecording: async () => recording,
      completeJob: async (_job, transcript) => { completedTranscript = transcript },
    })
    const storage: FileStorage = {
      openReadStream: async (storageKey) => {
        requestedStorageKey = storageKey
        return Readable.from(['audio bytes'])
      },
    }
    const transcriber: Transcriber = {
      transcribe: async (audio, metadata) => {
        receivedMetadata = metadata
        assert.equal((await buffer(audio)).toString(), 'audio bytes')
        return 'completed transcript'
      },
    }

    await processJob(job, store, storage, transcriber, createTestLogger().logger, abortSignal)

    assert.equal(requestedStorageKey, recording.storageKey)
    assert.deepEqual(receivedMetadata, {
      fileName: recording.fileName,
      contentType: recording.contentType,
    })
    assert.equal(completedTranscript, 'completed transcript')
    assert.equal(storeCalls(store).failures.length, 0)
  })

  it('fails a job whose recording has no storage key', async () => {
    const calls: FailureCall[] = []
    const store = createStore({
      getRecording: async () => ({ ...recording, storageKey: null }),
      failJob: async (failedJob, reason) => { calls.push({ job: failedJob, reason }) },
    })

    await processJob(
      job,
      store,
      unreachableStorage(),
      unreachableTranscriber(),
      createTestLogger().logger,
      abortSignal,
    )

    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.job.id, job.id)
    assert.equal(calls[0]?.reason, 'Recording has no storage key')
  })

  it('destroys the audio stream and persists provider failures', async () => {
    const audio = Readable.from(['audio bytes'])
    let failureReason: string | undefined
    const store = createStore({
      getRecording: async () => recording,
      failJob: async (_job, reason) => { failureReason = reason },
    })
    const storage: FileStorage = { openReadStream: async () => audio }
    const providerError = new Error('provider unavailable')
    const transcriber: Transcriber = {
      transcribe: async () => { throw providerError },
    }

    await processJob(job, store, storage, transcriber, createTestLogger().logger, abortSignal)

    assert.equal(audio.destroyed, true)
    assert.equal(failureReason, providerError.message)
  })

  it('logs a failure-state persistence error without crashing the worker', async () => {
    const testLogger = createTestLogger()
    const store = createStore({
      getRecording: async () => null,
      failJob: async () => { throw new Error('database unavailable') },
    })

    await processJob(
      job,
      store,
      unreachableStorage(),
      unreachableTranscriber(),
      testLogger.logger,
      abortSignal,
    )

    assert.ok(testLogger.entries.some((entry) =>
      entry.level === 'error' && entry.message === 'Could not persist transcription job failure'
    ))
  })
})

describe('Worker', () => {
  it('retries polling after a database error and sleeps between empty polls', async () => {
    const controller = new AbortController()
    const testLogger = createTestLogger()
    let claimCount = 0
    let waitCount = 0
    const store = createStore({
      claimNextJob: async () => {
        claimCount += 1
        if (claimCount === 1) {
          throw new Error('database busy')
        }
        return null
      },
    })
    const worker = new Worker({
      store,
      storage: unreachableStorage(),
      transcriber: unreachableTranscriber(),
      logger: testLogger.logger,
      pollIntervalMs: 5_000,
      waitForPoll: async (milliseconds) => {
        assert.equal(milliseconds, 5_000)
        waitCount += 1
        if (waitCount === 2) {
          controller.abort()
        }
      },
    })

    await worker.run(controller.signal)

    assert.equal(claimCount, 2)
    assert.equal(waitCount, 2)
    assert.ok(testLogger.entries.some((entry) =>
      entry.level === 'error' && entry.message === 'Could not claim a transcription job'
    ))
    assert.equal(testLogger.entries.at(-1)?.message, 'Worker stopped')
  })

  it('leaves an interrupted job processing so its lease can be recovered', async () => {
    const controller = new AbortController()
    let requestStarted: (() => void) | undefined
    const started = new Promise<void>((resolve) => { requestStarted = resolve })
    let claimCount = 0
    let failureCount = 0
    const store = createStore({
      claimNextJob: async () => {
        claimCount += 1
        return claimCount === 1 ? job : null
      },
      getRecording: async () => recording,
      failJob: async () => { failureCount += 1 },
    })
    const worker = new Worker({
      store,
      storage: { openReadStream: async () => Readable.from(['audio bytes']) },
      transcriber: {
        transcribe: async (_audio, _metadata, signal) =>
          await new Promise<string>((_resolve, reject) => {
            requestStarted?.()
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          }),
      },
      logger: createTestLogger().logger,
      pollIntervalMs: 5_000,
    })

    const running = worker.run(controller.signal)
    await started
    controller.abort()
    await running

    assert.equal(failureCount, 0)
    assert.equal(claimCount, 1)
  })
})

interface FailureCall {
  job: TranscriptionJob
  reason: string
}

interface TestLogger {
  logger: ReturnType<typeof createLogger>
  entries: Array<Record<string, unknown>>
}

const callRegistry = new WeakMap<Store, { failures: FailureCall[] }>()

function createStore(overrides: Partial<Store> = {}): Store {
  const failures: FailureCall[] = []
  const store: Store = {
    claimNextJob: async () => null,
    getRecording: async () => null,
    completeJob: async () => undefined,
    failJob: async (failedJob, reason) => { failures.push({ job: failedJob, reason }) },
    close: async () => undefined,
    ...overrides,
  }
  callRegistry.set(store, { failures })
  return store
}

function storeCalls(store: Store): { failures: FailureCall[] } {
  const calls = callRegistry.get(store)
  assert.ok(calls)
  return calls
}

function createTestLogger(): TestLogger {
  const entries: Array<Record<string, unknown>> = []
  return {
    logger: createLogger({ service: 'echo-worker' }, (line) => {
      entries.push(JSON.parse(line) as Record<string, unknown>)
    }),
    entries,
  }
}

function unreachableStorage(): FileStorage {
  return {
    openReadStream: async () => { throw new Error('Storage must not be called') },
  }
}

function unreachableTranscriber(): Transcriber {
  return {
    transcribe: async () => { throw new Error('Transcriber must not be called') },
  }
}

function createJob(): TranscriptionJob {
  return {
    id: 'job-1',
    recordingId: 'recording-1',
    status: 'processing',
    createdAt: new Date('2026-08-29T20:00:00.000Z'),
    updatedAt: new Date('2026-08-29T20:00:00.000Z'),
    retryCount: 0,
    failureReason: null,
  }
}

function createRecording(): Recording {
  return {
    id: 'recording-1',
    title: 'Test recording',
    status: 'transcribing',
    fileName: 'audio.webm',
    fileSizeBytes: 11,
    contentType: 'audio/webm',
    storageKey: 'recordings/recording-1/audio.webm',
    createdAt: new Date('2026-08-29T20:00:00.000Z'),
    updatedAt: new Date('2026-08-29T20:00:00.000Z'),
  }
}
