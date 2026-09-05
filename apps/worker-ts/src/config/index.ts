import type { RefinementConfig } from '../refinement/refiner.js'
export type RuntimeEnvironment = 'development' | 'test' | 'production'
export type TranscriptionProvider = 'openrouter' | 'openai'

export interface LocalStorageConfig {
  provider: 'local'
  rootPath: string
}

export interface S3StorageConfig {
  provider: 's3'
  bucket: string
  region: string
  endpoint?: string
  forcePathStyle?: boolean
}

export type StorageConfig = LocalStorageConfig | S3StorageConfig

export interface OpenRouterTranscriptionConfig {
  provider: 'openrouter'
  apiKey: string
  baseUrl: string
  model: string
}

export interface OpenAITranscriptionConfig {
  provider: 'openai'
  apiKey: string
}

export type TranscriptionConfig =
  | OpenRouterTranscriptionConfig
  | OpenAITranscriptionConfig

export interface WorkerConfig {
  environment: RuntimeEnvironment
  rabbit: { url: string; jobQueue: string; resultQueue: string; reconnectMs: number; retryMs: number }
  jobTimeoutMs: number
  refinement: RefinementConfig
  storage: StorageConfig
  transcription: TranscriptionConfig
}

export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError'
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const transcription = readTranscriptionConfig(env)
  const jobTimeoutMs = readPositiveInteger(env, 'JOB_TIMEOUT_MS', 120_000)
  const url = readRequired(env, 'RABBITMQ_URL')
  if (!/^amqps?:\/\//.test(url)) throw new ConfigurationError('RABBITMQ_URL must use amqp or amqps')
  const jobQueue = readOptional(env.RABBITMQ_JOB_QUEUE, 'echo.jobs')
  const resultQueue = readOptional(env.RABBITMQ_RESULT_QUEUE, 'echo.results')
  if (jobQueue === resultQueue) throw new ConfigurationError('RabbitMQ queues must differ')
  return {
    jobTimeoutMs,
    refinement: {
      provider: transcription.provider,
      apiKey: transcription.apiKey,
      baseUrl: readOptional(env.REFINEMENT_BASE_URL, transcription.provider === 'openrouter' ? transcription.baseUrl : 'https://api.openai.com/v1'),
      model: readOptional(env.REFINEMENT_MODEL, transcription.provider === 'openrouter' ? 'openai/gpt-4.1-mini' : 'gpt-4.1-mini'),
    },
    environment: readEnvironment(env.NODE_ENV),
    rabbit: { url, jobQueue, resultQueue,
      reconnectMs: readPositiveInteger(env, 'RABBITMQ_RECONNECT_MS', 5000),
      retryMs: readPositiveInteger(env, 'RABBITMQ_RETRY_MS', 5000) },
    storage: readStorageConfig(env),
    transcription,
  }
}

function readStorageConfig(env: NodeJS.ProcessEnv): StorageConfig {
  const provider = readChoice(env.STORAGE_PROVIDER ?? 'local', 'STORAGE_PROVIDER', [
    'local',
    's3',
  ] as const)

  if (provider === 'local') {
    return {
      provider,
      rootPath: readRequired(env, 'STORAGE_LOCAL_ROOT'),
    }
  }

  return {
    provider,
    bucket: readRequired(env, 'S3_BUCKET'),
    region: readOptional(env.AWS_REGION, 'us-east-1'),
    ...(env.S3_ENDPOINT?.trim() ? { endpoint: env.S3_ENDPOINT.trim() } : {}),
    forcePathStyle: readChoice(env.S3_FORCE_PATH_STYLE ?? 'false', 'S3_FORCE_PATH_STYLE', ['true', 'false']) === 'true',
  }
}

function readTranscriptionConfig(env: NodeJS.ProcessEnv): TranscriptionConfig {
  const provider = readChoice(
    env.TRANSCRIPTION_PROVIDER ?? 'openrouter',
    'TRANSCRIPTION_PROVIDER',
    ['openrouter', 'openai'] as const,
  )

  if (provider === 'openrouter') {
    return {
      provider,
      apiKey: readRequired(env, 'OPENROUTER_API_KEY'),
      baseUrl: readOptional(env.OPENROUTER_BASE_URL, 'https://openrouter.ai/api/v1'),
      model: readOptional(
        env.OPENROUTER_TRANSCRIPTION_MODEL,
        'openai/gpt-4o-mini-transcribe',
      ),
    }
  }

  return {
    provider,
    apiKey: readRequired(env, 'OPENAI_API_KEY'),
  }
}

function readEnvironment(value: string | undefined): RuntimeEnvironment {
  return readChoice(value ?? 'development', 'NODE_ENV', [
    'development',
    'test',
    'production',
  ] as const)
}

function readRequired(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) {
    throw new ConfigurationError(`${name} is required`)
  }

  return value
}

function readOptional(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

function readPositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const rawValue = env[name]
  if (rawValue === undefined || rawValue.trim() === '') {
    return fallback
  }

  const value = Number(rawValue)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer`)
  }

  return value
}

function readChoice<const T extends readonly string[]>(
  rawValue: string,
  name: string,
  choices: T,
): T[number] {
  const value = rawValue.trim().toLowerCase()
  if (!choices.includes(value)) {
    throw new ConfigurationError(`${name} must be one of: ${choices.join(', ')}`)
  }

  return value
}
