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

const localEnv = { ...env, OPENROUTER_API_KEY: '', TRANSCRIPTION_PROVIDER: 'local',
  LOCAL_TRANSCRIPTION_MODEL: 'Systran/faster-whisper-small', REFINEMENT_MODEL: 'local-chat' }
it('runs local transcription and refinement without cloud credentials', () => {
  const config = loadConfig(localEnv)
  assert.deepEqual(config.transcription, { provider: 'local', apiKey: '',
    baseUrl: 'http://localhost:8000/v1', model: 'Systran/faster-whisper-small' })
  assert.deepEqual(config.refinement, { provider: 'local', apiKey: '',
    baseUrl: 'http://localhost:11434/v1', model: 'local-chat' })
})
it('keeps remote defaults and supports independently selected refinement credentials', () => {
  assert.deepEqual(loadConfig(env).refinement, { provider: 'openrouter', apiKey: 'test',
    baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1-mini' })
  const config = loadConfig({ ...localEnv, REFINEMENT_PROVIDER: 'openai', OPENAI_API_KEY: 'chat-key',
    LOCAL_TRANSCRIPTION_API_KEY: 'speech-key', LOCAL_TRANSCRIPTION_BASE_URL: 'http://speech:8000/v1/' })
  assert.equal(config.refinement.provider, 'openai')
  assert.equal(config.refinement.apiKey, 'chat-key')
  assert.equal('apiKey' in config.transcription && config.transcription.apiKey, 'speech-key')
  assert.equal('baseUrl' in config.transcription && config.transcription.baseUrl, 'http://speech:8000/v1')
  assert.equal(loadConfig({ ...localEnv, REFINEMENT_PROVIDER: 'openrouter', REFINEMENT_API_KEY: 'override' }).refinement.apiKey, 'override')
})
it('validates local models, URLs and refinement provider', () => {
  assert.throws(() => loadConfig({ ...localEnv, LOCAL_TRANSCRIPTION_MODEL: '' }), /LOCAL_TRANSCRIPTION_MODEL/)
  assert.throws(() => loadConfig({ ...localEnv, REFINEMENT_MODEL: '' }), /REFINEMENT_MODEL/)
  assert.throws(() => loadConfig({ ...localEnv, REFINEMENT_PROVIDER: 'unknown' }), /REFINEMENT_PROVIDER/)
  for (const value of ['invalid', 'file:///tmp/model', 'http://user:pass@localhost', 'http://localhost?q=x', 'http://localhost#x']) {
    assert.throws(() => loadConfig({ ...localEnv, LOCAL_TRANSCRIPTION_BASE_URL: value }), /LOCAL_TRANSCRIPTION_BASE_URL/)
    assert.throws(() => loadConfig({ ...localEnv, REFINEMENT_BASE_URL: value }), /REFINEMENT_BASE_URL/)
  }
})

it('configures embedded whisper.cpp without transcription API keys', () => {
  const config = loadConfig({ ...env, OPENROUTER_API_KEY: '', TRANSCRIPTION_PROVIDER: 'whisper-cpp',
    WHISPER_MODEL_PATH: '/models/small.bin', REFINEMENT_MODEL: 'chat' })
  assert.deepEqual(config.transcription, { provider: 'whisper-cpp', modelPath: '/models/small.bin',
    binaryPath: 'whisper-cli', ffmpegPath: 'ffmpeg', language: 'auto', threads: 4, useGpu: false })
  assert.equal(config.refinement.provider, 'local')
  assert.throws(() => loadConfig({ ...env, TRANSCRIPTION_PROVIDER: 'whisper-cpp' }), /WHISPER_MODEL_PATH/)
  for (const overrides of [{ WHISPER_THREADS: '0' }, { WHISPER_USE_GPU: 'yes' }]) {
    assert.throws(() => loadConfig({ ...env, TRANSCRIPTION_PROVIDER: 'whisper-cpp', WHISPER_MODEL_PATH: '/m', ...overrides }))
  }
})
