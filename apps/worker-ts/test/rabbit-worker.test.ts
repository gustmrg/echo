import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib'
import { handleDelivery } from '../src/messaging/rabbit-worker.js'
import { parseJob, type JobResult } from '../src/messaging/messages.js'
import { createLogger } from '../src/logging/logger.js'
import { UnsupportedAudioFormatError } from '../src/transcription/transcriber.js'

const job = { job_id: '00000000-0000-0000-0000-000000000001', claim_token: '00000000-0000-0000-0000-000000000002', kind: 'transcription' as const, file_key: 'audio', file_name: 'audio.wav' }

function setup(
  redelivered = false,
  publishFails = false,
  payload: Record<string, unknown> = job,
  properties: Record<string, unknown> = {},
) {
  const events: string[] = []
  const logs: Record<string, unknown>[] = []
  let output: JobResult | undefined
  let publishOptions: Options.Publish | undefined
  const logger = createLogger({ service: 'echo-worker' }, line => {
    logs.push(JSON.parse(line) as Record<string, unknown>)
  })
  const channel = {
    sendToQueue(_queue: string, bytes: Buffer, options: Options.Publish, callback: (error: Error | null) => void) {
      events.push('publish')
      output = JSON.parse(bytes.toString())
      publishOptions = options
      callback(publishFails ? new Error('disconnect') : null)
      return true
    },
    ack() { events.push('ack') }, nack(_delivery: unknown, _all: boolean, requeue: boolean) { events.push(`nack:${requeue}`) },
    reject() { events.push('reject') },
  } as unknown as ConfirmChannel
  const delivery = {
    content: Buffer.from(JSON.stringify(payload)),
    fields: { redelivered },
    properties,
  } as unknown as ConsumeMessage
  return { channel, delivery, events, logs, logger, output: () => output, publishOptions: () => publishOptions }
}

it('acknowledges only after result publication is confirmed', async () => {
  const s = setup()
  await handleDelivery(s.channel, s.delivery, 'results', async () => ({ ...job, status: 'completed', transcription_text: 'text' }), new AbortController().signal, 100, 1, s.logger)
  assert.deepEqual(s.events, ['publish', 'ack'])
})

it('does not ack when result publication fails', async () => {
  const s = setup(false, true)
  await assert.rejects(handleDelivery(s.channel, s.delivery, 'results', async () => ({ ...job, status: 'completed' }), new AbortController().signal, 100, 1, s.logger))
  assert.deepEqual(s.events, ['publish'])
})

it('nacks transient failures and reports failure after redelivery', async () => {
  for (const redelivered of [false, true]) {
    const s = setup(redelivered, false, { ...job, correlation_id: 'corr-transient-1' })
    await handleDelivery(s.channel, s.delivery, 'results', async () => { throw new Error('network') }, new AbortController().signal, 100, 1, s.logger)
    assert.deepEqual(s.events, redelivered ? ['publish', 'ack'] : ['nack:true'])
    if (redelivered) {
      assert.equal(s.output()?.retryable, true)
      assert.equal(s.output()?.correlation_id, 'corr-transient-1')
      assert.equal(s.publishOptions()?.correlationId, 'corr-transient-1')
      const failedLog = s.logs.find(entry => entry.message === 'Job failed')
      assert.equal(failedLog?.correlation_id, 'corr-transient-1')
      assert.equal(failedLog?.job_id, job.job_id)
      assert.equal(failedLog?.job_kind, job.kind)
      assert.equal(failedLog?.redelivered, true)
      assert.equal(failedLog?.retryable, true)
      assert.equal(typeof failedLog?.duration_ms, 'number')
    } else {
      const requeueLog = s.logs.find(entry => entry.message === 'Job requeued after transient failure')
      assert.equal(requeueLog?.correlation_id, 'corr-transient-1')
      assert.equal(requeueLog?.job_id, job.job_id)
      assert.equal(typeof requeueLog?.duration_ms, 'number')
    }
  }
})

it('quarantines malformed payloads without calling providers', async () => {
  const s = setup(); s.delivery.content = Buffer.from('{}')
  await handleDelivery(s.channel, s.delivery, 'results', async () => { throw new Error('must not call') }, new AbortController().signal, 100, 1, s.logger)
  assert.deepEqual(s.events, ['reject'])
})

it('leaves shutdown-interrupted work unacknowledged for broker redelivery', async () => {
  const s = setup(); const controller = new AbortController()
  await handleDelivery(s.channel, s.delivery, 'results', async () => { controller.abort(); throw new Error('shutdown') }, controller.signal, 100, 1, s.logger)
  assert.deepEqual(s.events, [])
})

it('parses optional correlation_id and rejects invalid values', () => {
  assert.equal(parseJob(Buffer.from(JSON.stringify(job))).correlation_id, undefined)
  assert.equal(parseJob(Buffer.from(JSON.stringify({ ...job, correlation_id: null }))).correlation_id, undefined)
  assert.equal(parseJob(Buffer.from(JSON.stringify({ ...job, correlation_id: 'req-abc-123' }))).correlation_id, 'req-abc-123')
  assert.throws(() => parseJob(Buffer.from(JSON.stringify({ ...job, correlation_id: '' }))), /Invalid correlation_id/)
  assert.throws(() => parseJob(Buffer.from(JSON.stringify({ ...job, correlation_id: '   ' }))), /Invalid correlation_id/)
  assert.throws(() => parseJob(Buffer.from(JSON.stringify({ ...job, correlation_id: 'a'.repeat(65) }))), /Invalid correlation_id/)
  assert.throws(() => parseJob(Buffer.from(JSON.stringify({ ...job, correlation_id: 123 }))), /Invalid correlation_id/)
})

it('propagates correlation_id from payload and falls back to AMQP properties with structured telemetry', async () => {
  const fromPayload = setup(false, false, { ...job, correlation_id: 'corr-payload-1' })
  await handleDelivery(
    fromPayload.channel,
    fromPayload.delivery,
    'results',
    async incoming => ({ ...incoming, status: 'completed', transcription_text: 'hello' }),
    new AbortController().signal,
    100,
    1,
    fromPayload.logger,
  )
  assert.equal(fromPayload.output()?.correlation_id, 'corr-payload-1')
  assert.equal(fromPayload.publishOptions()?.correlationId, 'corr-payload-1')
  const started = fromPayload.logs.find(entry => entry.message === 'Job started')
  const completed = fromPayload.logs.find(entry => entry.message === 'Job completed')
  assert.equal(started?.correlation_id, 'corr-payload-1')
  assert.equal(started?.job_id, job.job_id)
  assert.equal(started?.job_kind, 'transcription')
  assert.equal(started?.redelivered, false)
  assert.equal(completed?.correlation_id, 'corr-payload-1')
  assert.equal(typeof completed?.duration_ms, 'number')

  const fromHeader = setup(false, false, job, { correlationId: 'corr-header-2' })
  await handleDelivery(
    fromHeader.channel,
    fromHeader.delivery,
    'results',
    async incoming => {
      assert.equal(incoming.correlation_id, 'corr-header-2')
      return { job_id: incoming.job_id, claim_token: incoming.claim_token, kind: incoming.kind, status: 'completed', transcription_text: 'world' }
    },
    new AbortController().signal,
    100,
    1,
    fromHeader.logger,
  )
  assert.equal(fromHeader.output()?.correlation_id, 'corr-header-2')
  assert.equal(fromHeader.publishOptions()?.correlationId, 'corr-header-2')
  assert.equal(fromHeader.logs.find(entry => entry.message === 'Job completed')?.correlation_id, 'corr-header-2')
})

it('logs non-retryable failures immediately with retryable=false', async () => {
  const s = setup(false, false, { ...job, correlation_id: 'corr-bad-audio' })
  await handleDelivery(
    s.channel,
    s.delivery,
    'results',
    async () => { throw new UnsupportedAudioFormatError('bad format') },
    new AbortController().signal,
    100,
    1,
    s.logger,
  )
  assert.deepEqual(s.events, ['publish', 'ack'])
  assert.equal(s.output()?.retryable, false)
  assert.equal(s.output()?.correlation_id, 'corr-bad-audio')
  const failedLog = s.logs.find(entry => entry.message === 'Job failed')
  assert.equal(failedLog?.retryable, false)
  assert.equal(failedLog?.correlation_id, 'corr-bad-audio')
  assert.equal(typeof failedLog?.duration_ms, 'number')
})
