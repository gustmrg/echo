import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { ConfirmChannel, ConsumeMessage } from 'amqplib'
import { handleDelivery } from '../src/messaging/rabbit-worker.js'
import type { JobResult } from '../src/messaging/messages.js'
const job = { job_id: '00000000-0000-0000-0000-000000000001', claim_token: '00000000-0000-0000-0000-000000000002', kind: 'transcription' as const, file_key: 'audio', file_name: 'audio.wav' }
function setup(redelivered = false, publishFails = false) {
  const events: string[] = []
  let output: JobResult | undefined
  const channel = {
    sendToQueue(_queue: string, bytes: Buffer, _options: unknown, callback: (error: Error | null) => void) {
      events.push('publish'); output = JSON.parse(bytes.toString()); callback(publishFails ? new Error('disconnect') : null); return true
    },
    ack() { events.push('ack') }, nack(_delivery: unknown, _all: boolean, requeue: boolean) { events.push(`nack:${requeue}`) },
    reject() { events.push('reject') },
  } as unknown as ConfirmChannel
  const delivery = { content: Buffer.from(JSON.stringify(job)), fields: { redelivered } } as ConsumeMessage
  return { channel, delivery, events, output: () => output }
}
it('acknowledges only after result publication is confirmed', async () => {
  const s = setup()
  await handleDelivery(s.channel, s.delivery, 'results', async () => ({ ...job, status: 'completed', transcription_text: 'text' }), new AbortController().signal, 100, 1)
  assert.deepEqual(s.events, ['publish', 'ack'])
})
it('does not ack when result publication fails', async () => {
  const s = setup(false, true)
  await assert.rejects(handleDelivery(s.channel, s.delivery, 'results', async () => ({ ...job, status: 'completed' }), new AbortController().signal, 100, 1))
  assert.deepEqual(s.events, ['publish'])
})
it('nacks transient failures and reports failure after redelivery', async () => {
  for (const redelivered of [false, true]) {
    const s = setup(redelivered)
    await handleDelivery(s.channel, s.delivery, 'results', async () => { throw new Error('network') }, new AbortController().signal, 100, 1)
    assert.deepEqual(s.events, redelivered ? ['publish', 'ack'] : ['nack:true'])
    if (redelivered) assert.equal(s.output()?.retryable, true)
  }
})
it('quarantines malformed payloads without calling providers', async () => {
  const s = setup(); s.delivery.content = Buffer.from('{}')
  await handleDelivery(s.channel, s.delivery, 'results', async () => { throw new Error('must not call') }, new AbortController().signal, 100, 1)
  assert.deepEqual(s.events, ['reject'])
})
it('leaves shutdown-interrupted work unacknowledged for broker redelivery', async () => {
  const s = setup(); const controller = new AbortController()
  await handleDelivery(s.channel, s.delivery, 'results', async () => { controller.abort(); throw new Error('shutdown') }, controller.signal, 100, 1)
  assert.deepEqual(s.events, [])
})
