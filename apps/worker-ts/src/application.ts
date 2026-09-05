import { ChatRefiner } from './refinement/refiner.js'
import type { WorkerConfig } from './config/index.js'
import type { Logger } from './logging/logger.js'
import { createFileStorage } from './storage/index.js'
import { createTranscriber } from './transcription/index.js'
import { processJob } from './worker.js'
import { runRabbitWorker } from './messaging/rabbit-worker.js'

export async function runApplication(config: WorkerConfig, logger: Logger, signal: AbortSignal): Promise<void> {
  const storage = createFileStorage(config.storage)
  const transcriber = createTranscriber(config.transcription)
  const refiner = new ChatRefiner(config.refinement)
  await runRabbitWorker(config, logger, signal,
    (job, jobSignal) => processJob(job, storage, transcriber, refiner, jobSignal))
}
