import { connect, type ConfirmChannel, type ConsumeMessage } from 'amqplib'
import { setTimeout as delay } from 'node:timers/promises'
import type { WorkerConfig } from '../config/index.js'
import type { Logger } from '../logging/logger.js'
import { parseJob, type JobResult, type JobMessage } from './messages.js'
import { UnsupportedAudioFormatError } from '../transcription/transcriber.js'

function extractPropertyCorrelationId(delivery: ConsumeMessage): string | undefined {
  const raw: unknown = delivery.properties?.correlationId
  if (typeof raw !== 'string') return undefined
  if (!raw.trim() || raw.length > 64) return undefined
  return raw
}

export async function handleDelivery(channel: Pick<ConfirmChannel, 'sendToQueue' | 'ack' | 'nack' | 'reject'>,
  delivery: ConsumeMessage, resultQueue: string, process: (job: JobMessage, signal: AbortSignal) => Promise<JobResult>,
  signal: AbortSignal, timeoutMs: number, retryMs: number, logger?: Logger): Promise<void> {
  let job: JobMessage
  try { job = parseJob(delivery.content) }
  catch {
    logger?.warn('Rejecting malformed job message', {
      correlation_id: extractPropertyCorrelationId(delivery),
    })
    channel.reject(delivery, false)
    return
  }
  const correlation_id = job.correlation_id ?? extractPropertyCorrelationId(delivery)
  if (correlation_id && !job.correlation_id) {
    job = { ...job, correlation_id }
  }
  const jobLogger = logger?.child({
    correlation_id,
    job_id: job.job_id,
    job_kind: job.kind,
    redelivered: delivery.fields.redelivered,
  })
  const startedAt = performance.now()
  jobLogger?.info('Job started')
  let result: JobResult
  try {
    result = await process(job, AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]))
    if (correlation_id && !result.correlation_id) {
      result = { ...result, correlation_id }
    }
  } catch (error) {
    if (signal.aborted) return // Closing the connection requeues the unacknowledged delivery.
    const retryable = !(error instanceof UnsupportedAudioFormatError)
    const duration_ms = Math.max(0, Math.round(performance.now() - startedAt))
    if (retryable && !delivery.fields.redelivered) {
      jobLogger?.warn('Job requeued after transient failure', { duration_ms, retryable })
      await delay(retryMs, undefined, { signal })
      channel.nack(delivery, false, true)
      return
    }
    jobLogger?.error('Job failed', error, { duration_ms, retryable })
    result = { job_id: job.job_id, claim_token: job.claim_token, kind: job.kind,
      ...(correlation_id ? { correlation_id } : {}),
      status: 'failed', error: 'Processing failed. Check provider/storage configuration or retry.', retryable }
  }
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    channel.sendToQueue(resultQueue, Buffer.from(JSON.stringify(result)),
      {
        persistent: true,
        contentType: 'application/json',
        messageId: `${job.job_id}:${job.claim_token}`,
        ...(correlation_id ? { correlationId: correlation_id } : {}),
      },
      (error: unknown) => error ? reject(error) : resolve())
  })
  signal.throwIfAborted()
  channel.ack(delivery)
  if (result.status === 'completed') {
    const duration_ms = Math.max(0, Math.round(performance.now() - startedAt))
    jobLogger?.info('Job completed', { duration_ms })
  }
}

export async function runRabbitWorker(config: WorkerConfig, logger: Logger, signal: AbortSignal,
  process: (job: JobMessage, signal: AbortSignal) => Promise<JobResult>): Promise<void> {
  while (!signal.aborted) {
    try {
      const url = new URL(config.rabbit.url)
      url.searchParams.set('heartbeat', '15')
      const connection = await connect(url.toString(), { timeout: 10_000 })
      const controller = new AbortController()
      const sessionSignal = AbortSignal.any([signal, controller.signal])
      let finish!: () => void
      const disconnected = new Promise<void>(resolve => { finish = resolve })
      const close = () => { controller.abort(); finish() }
      connection.on('error', () => close())
      connection.on('close', close)
      signal.addEventListener('abort', close, { once: true })
      let active: Promise<void> | undefined
      try {
        const channel = await connection.createConfirmChannel()
        channel.on('error', close)
        channel.on('close', close)
        for (const queue of [config.rabbit.jobQueue, config.rabbit.resultQueue]) {
          await channel.assertQueue(`${queue}.invalid`, { durable: true })
          await channel.assertQueue(queue, { durable: true, arguments: {
            'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': `${queue}.invalid`,
          } })
        }
        await channel.prefetch(1)
        await channel.consume(config.rabbit.jobQueue, delivery => {
          if (!delivery) { close(); return }
          if (sessionSignal.aborted) return
          const deadline = setTimeout(close, config.jobTimeoutMs + config.rabbit.retryMs + 15_000)
          active = handleDelivery(channel, delivery, config.rabbit.resultQueue, process,
            sessionSignal, config.jobTimeoutMs, config.rabbit.retryMs, logger)
            .catch(() => close()).finally(() => clearTimeout(deadline))
        }, { noAck: false })
        logger.info('RabbitMQ consumer ready')
        if (signal.aborted) close()
        await disconnected
      } finally {
        controller.abort()
        signal.removeEventListener('abort', close)
        await connection.close().catch(() => undefined)
        await active
      }
    } catch {
      if (!signal.aborted) logger.warn('RabbitMQ unavailable; reconnecting')
    }
    if (!signal.aborted) {
      try { await delay(config.rabbit.reconnectMs, undefined, { signal }) }
      catch (error) { if (!signal.aborted) throw error }
    }
  }
}
