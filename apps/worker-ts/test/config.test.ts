import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ConfigurationError, loadConfig } from '../src/config/index.js'

describe('loadConfig', () => {
  it('loads local storage and OpenRouter defaults', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DB_PATH: '/data/echo.db',
      STORAGE_PROVIDER: 'local',
      STORAGE_LOCAL_ROOT: '/data/files',
      TRANSCRIPTION_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'secret',
    })

    assert.deepEqual(config, {
      environment: 'test',
      database: { path: '/data/echo.db' },
      polling: {
        intervalMs: 5_000,
        processingLeaseMs: 15 * 60_000,
      },
      storage: {
        provider: 'local',
        rootPath: '/data/files',
      },
      transcription: {
        provider: 'openrouter',
        apiKey: 'secret',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o-mini-transcribe',
      },
    })
  })

  it('loads S3 storage and OpenAI transcription', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DB_PATH: '/data/echo.db',
      STORAGE_PROVIDER: 's3',
      S3_BUCKET: 'echo-production',
      AWS_REGION: 'sa-east-1',
      TRANSCRIPTION_PROVIDER: 'openai',
      OPENAI_API_KEY: 'secret',
      POLL_INTERVAL_MS: '2500',
      PROCESSING_LEASE_MS: '60000',
    })

    assert.equal(config.storage.provider, 's3')
    assert.deepEqual(config.storage, {
      provider: 's3',
      bucket: 'echo-production',
      region: 'sa-east-1',
    })
    assert.deepEqual(config.transcription, {
      provider: 'openai',
      apiKey: 'secret',
    })
    assert.deepEqual(config.polling, {
      intervalMs: 2_500,
      processingLeaseMs: 60_000,
    })
  })

  it('fails fast when a required value is missing', () => {
    assert.throws(
      () => loadConfig({
        STORAGE_PROVIDER: 'local',
        STORAGE_LOCAL_ROOT: '/data/files',
        OPENROUTER_API_KEY: 'secret',
      }),
      (error: unknown) =>
        error instanceof ConfigurationError && error.message === 'DB_PATH is required',
    )
  })

  it('rejects invalid numeric settings', () => {
    assert.throws(
      () => loadConfig({
        DB_PATH: '/data/echo.db',
        STORAGE_PROVIDER: 'local',
        STORAGE_LOCAL_ROOT: '/data/files',
        OPENROUTER_API_KEY: 'secret',
        POLL_INTERVAL_MS: '0',
      }),
      (error: unknown) =>
        error instanceof ConfigurationError &&
        error.message === 'POLL_INTERVAL_MS must be a positive integer',
    )
  })
})
