import { runApplication } from './application.js'
import { loadConfig } from './config/index.js'
import { createLogger } from './logging/logger.js'

const logger = createLogger({ service: 'echo-worker' })
const shutdown = new AbortController()

function requestShutdown(signalName: NodeJS.Signals): void {
  logger.info('Shutdown requested', { signal: signalName })
  shutdown.abort()
}

const onSigint = (): void => requestShutdown('SIGINT')
const onSigterm = (): void => requestShutdown('SIGTERM')

process.once('SIGINT', onSigint)
process.once('SIGTERM', onSigterm)

try {
  const config = loadConfig()

  logger.info('Worker configuration loaded', {
    environment: config.environment,
    storageProvider: config.storage.provider,
    transcriptionProvider: config.transcription.provider,
  })

  await runApplication(config, logger, shutdown.signal)
} catch (error) {
  logger.error('Worker stopped unexpectedly', error)
  process.exitCode = 1
} finally {
  process.off('SIGINT', onSigint)
  process.off('SIGTERM', onSigterm)
}
