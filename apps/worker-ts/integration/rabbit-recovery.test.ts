import assert from 'node:assert/strict'
import { it } from 'node:test'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { connect } from 'amqplib'
import { loadConfig } from '../src/config/index.js'
import { runRabbitWorker } from '../src/messaging/rabbit-worker.js'
import { createLogger } from '../src/logging/logger.js'

// Only run against an explicitly named disposable Compose project.
it('reconnects after broker restart and redelivers interrupted processing', {
  skip: !process.env.ECHO_TEST_DOCKER_PROJECT, timeout: 90_000,
}, async () => {
  const prefix = `echo.recovery.${randomUUID()}`
  const url = process.env.ECHO_TEST_RABBITMQ_URL ?? 'amqp://echo:echo-dev-only@127.0.0.1:5672'
  const config = loadConfig({ RABBITMQ_URL: url, RABBITMQ_JOB_QUEUE: `${prefix}.jobs`,
    RABBITMQ_RESULT_QUEUE: `${prefix}.results`, RABBITMQ_RECONNECT_MS: '200',
    STORAGE_PROVIDER: 's3', S3_BUCKET: 'unused', OPENROUTER_API_KEY: 'unused', JOB_TIMEOUT_MS: '60000' })
  const controller = new AbortController()
  let calls = 0; let interrupted = false; let started!: () => void
  const processing = new Promise<void>(resolve => { started = resolve })
  const worker = runRabbitWorker(config, createLogger({ service: 'recovery-test' }), controller.signal, async (job, signal) => {
    if (++calls === 1) {
      started()
      try { await delay(60_000, undefined, { signal }) }
      catch (error) { interrupted = true; throw error }
    }
    return { ...job, status: 'completed', transcription_text: 'recovered' }
  })
  async function connection() {
    for (let i = 0; i < 100; i++) {
      try { const c = await connect(url); c.on('error', () => {}); return c } catch { await delay(200) }
    }
    throw new Error('Broker did not recover')
  }
  try {
    const publisher = await connection()
    const channel = await publisher.createConfirmChannel()
    for (const queue of [config.rabbit.jobQueue, config.rabbit.resultQueue]) {
      await channel.assertQueue(`${queue}.invalid`, { durable: true })
      await channel.assertQueue(queue, { durable: true, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': `${queue}.invalid` } })
    }
    channel.sendToQueue(config.rabbit.jobQueue, Buffer.from(JSON.stringify({ job_id: randomUUID(), claim_token: randomUUID(), kind: 'transcription', file_key: 'audio', file_name: 'audio.wav' })), { persistent: true })
    await channel.waitForConfirms(); await publisher.close()
    await Promise.race([processing, delay(10_000).then(() => { throw new Error('Worker never started') })])
    await promisify(execFile)('docker', ['compose', '-p', process.env.ECHO_TEST_DOCKER_PROJECT!, 'restart', 'rabbitmq'], { cwd: '../..' })
    const reader = await connection()
    try {
      const results = await reader.createChannel()
      let received = false
      for (let i = 0; i < 100; i++) {
        const message = await results.get(config.rabbit.resultQueue, { noAck: true })
        if (message) { assert.equal(JSON.parse(message.content.toString()).transcription_text, 'recovered'); received = true; break }
        await delay(200)
      }
      assert.ok(received); assert.ok(interrupted); assert.equal(calls, 2)
      controller.abort(); await worker
      for (const queue of [config.rabbit.jobQueue, config.rabbit.resultQueue]) {
        await results.deleteQueue(queue); await results.deleteQueue(`${queue}.invalid`)
      }
    } finally { await reader.close() }
  } finally { controller.abort(); await worker }
})
