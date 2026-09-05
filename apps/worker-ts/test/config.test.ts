import assert from 'node:assert/strict'
import { it } from 'node:test'
import { loadConfig } from '../src/config/index.js'
const env = { RABBITMQ_URL: 'amqp://localhost', STORAGE_PROVIDER: 's3', S3_BUCKET: 'audio', OPENROUTER_API_KEY: 'test' }
it('requires broker configuration and never needs a database', () => {
  const config = loadConfig(env)
  assert.equal(config.rabbit.jobQueue, 'echo.jobs')
  assert.equal('database' in config, false)
  assert.throws(() => loadConfig({ ...env, RABBITMQ_URL: '' }), /RABBITMQ_URL/)
})
it('validates queue separation and positive timeouts', () => {
  assert.throws(() => loadConfig({ ...env, RABBITMQ_JOB_QUEUE: 'x', RABBITMQ_RESULT_QUEUE: 'x' }), /differ/)
  assert.throws(() => loadConfig({ ...env, JOB_TIMEOUT_MS: '0' }), /positive/)
  assert.throws(() => loadConfig({ ...env, RABBITMQ_URL: 'https://localhost' }), /amqp/)
})
it('supports S3-compatible endpoints and OpenAI configuration', () => {
  const config = loadConfig({ ...env, S3_ENDPOINT: 'http://localhost:8333', S3_FORCE_PATH_STYLE: 'true',
    TRANSCRIPTION_PROVIDER: 'openai', OPENAI_API_KEY: 'test' })
  assert.deepEqual(config.storage, { provider: 's3', bucket: 'audio', region: 'us-east-1', endpoint: 'http://localhost:8333', forcePathStyle: true })
  assert.equal(config.transcription.provider, 'openai')
})
