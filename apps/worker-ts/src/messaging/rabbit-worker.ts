import { connect, type ConfirmChannel, type ConsumeMessage } from 'amqplib'
import { setTimeout as delay } from 'node:timers/promises'
import type { WorkerConfig } from '../config/index.js'
import type { Logger } from '../logging/logger.js'
import { parseJob, type JobResult, type JobMessage } from './messages.js'
import { UnsupportedAudioFormatError } from '../transcription/transcriber.js'

export async function handleDelivery(channel: Pick<ConfirmChannel, 'sendToQueue' | 'ack' | 'nack' | 'reject'>,
  delivery: ConsumeMessage, resultQueue: string, process: (job: JobMessage, signal: AbortSignal) => Promise<JobResult>,
  signal: AbortSignal, timeoutMs: number, retryMs: number): Promise<void> {
  let job: JobMessage
  try { job = parseJob(delivery.content) }
  catch { channel.reject(delivery, false); return }
  let result: JobResult
  try {
    result = await process(job, AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]))
  } catch (error) {
    if (signal.aborted) return // Closing the connection requeues the unacknowledged delivery.
    const retryable = !(error instanceof UnsupportedAudioFormatError)
    if (retryable && !delivery.fields.redelivered) {
      await delay(retryMs, undefined, { signal })
      channel.nack(delivery, false, true)
      return
    }
    result = { job_id: job.job_id, claim_token: job.claim_token, kind: job.kind,
      status: 'failed', error: 'Processing failed. Check provider/storage configuration or retry.', retryable }
  }
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    channel.sendToQueue(resultQueue, Buffer.from(JSON.stringify(result)),
      { persistent: true, contentType: 'application/json', messageId: `${job.job_id}:${job.claim_token}` },
      (error: unknown) => error ? reject(error) : resolve())
  })
  signal.throwIfAborted()
  channel.ack(delivery)
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
            sessionSignal, config.jobTimeoutMs, config.rabbit.retryMs)
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
