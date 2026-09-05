import { ChatRefiner } from './refinement/refiner.js'
import { RefinementStore } from './refinement/store.js'
import { runRefinements } from './refinement/worker.js'
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

  const refinements = new RefinementStore(config.database.path, config.polling.processingLeaseMs)
  const controller = new AbortController()
  const runningSignal = AbortSignal.any([signal, controller.signal])
  try {
    const worker = new Worker({
      store,
      storage: createFileStorage(config.storage),
      transcriber: createTranscriber(config.transcription),
      logger,
      jobTimeoutMs: config.jobTimeoutMs,
      pollIntervalMs: config.polling.intervalMs,
    })
    const tasks = [worker.run(runningSignal), runRefinements(refinements, new ChatRefiner(config.refinement),
      logger, runningSignal, config.polling.intervalMs, config.jobTimeoutMs)]
    try { await Promise.all(tasks) }
    finally { controller.abort(); await Promise.allSettled(tasks) }
  } finally {
    refinements.close()
    await store.close()
  }
}
