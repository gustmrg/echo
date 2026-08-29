import { loadConfig } from './config/index.js'
import { createLogger } from './logging/logger.js'

const logger = createLogger({ service: 'echo-worker' })

try {
  const config = loadConfig()

  logger.info('Worker configuration validated', {
    environment: config.environment,
    storageProvider: config.storage.provider,
    transcriptionProvider: config.transcription.provider,
  })
} catch (error) {
  logger.error('Worker configuration is invalid', error)
  process.exitCode = 1
}
