import type { WorkerConfig } from './config/index.js'
import { SqliteStore } from './db/sqlite-store.js'
import type { Logger } from './logging/logger.js'
import { createFileStorage } from './storage/index.js'
import { createTranscriber } from './transcription/index.js'
import { Worker } from './worker.js'

export async function runApplication(
  config: WorkerConfig,
  logger: Logger,
  signal: AbortSignal,
): Promise<void> {
  const store = new SqliteStore(config.database.path, {
    processingLeaseMs: config.polling.processingLeaseMs,
  })

  try {
    const worker = new Worker({
      store,
      storage: createFileStorage(config.storage),
      transcriber: createTranscriber(config.transcription),
      logger,
      pollIntervalMs: config.polling.intervalMs,
    })
    await worker.run(signal)
  } finally {
    await store.close()
  }
}
