import type { WhisperCppOptions } from '../transcription/whisper-cpp/engine.js'
import type { RefinementConfig } from '../refinement/refiner.js'
export type RuntimeEnvironment = 'development' | 'test' | 'production'
export type TranscriptionProvider = 'openrouter' | 'openai' | 'local' | 'whisper-cpp'

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

export interface LocalTranscriptionConfig {
  provider: 'local'
  apiKey: string
  baseUrl: string
  model: string
}

export type TranscriptionConfig =
  | OpenRouterTranscriptionConfig
  | OpenAITranscriptionConfig
  | LocalTranscriptionConfig
  | (WhisperCppOptions & { provider: 'whisper-cpp' })

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
    refinement: readRefinementConfig(env, transcription),
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
    ['openrouter', 'openai', 'local', 'whisper-cpp'] as const,
  )

  if (provider === 'whisper-cpp') {
    return {
      provider,
      modelPath: readRequired(env, 'WHISPER_MODEL_PATH'),
      binaryPath: readOptional(env.WHISPER_BINARY_PATH, 'whisper-cli'),
      ffmpegPath: readOptional(env.FFMPEG_PATH, 'ffmpeg'),
      language: readOptional(env.WHISPER_LANGUAGE, 'auto'),
      threads: readPositiveInteger(env, 'WHISPER_THREADS', 4),
      useGpu: readChoice(readOptional(env.WHISPER_USE_GPU, 'false'), 'WHISPER_USE_GPU', ['true', 'false']) === 'true',
    }
  }

  if (provider === 'local') {
    return {
      provider,
      apiKey: readOptional(env.LOCAL_TRANSCRIPTION_API_KEY, ''),
      baseUrl: readHttpUrl(env.LOCAL_TRANSCRIPTION_BASE_URL, 'LOCAL_TRANSCRIPTION_BASE_URL', 'http://localhost:8000/v1'),
      model: readRequired(env, 'LOCAL_TRANSCRIPTION_MODEL'),
    }
  }

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

function readRefinementConfig(env: NodeJS.ProcessEnv, transcription: TranscriptionConfig): RefinementConfig {
  const provider = readChoice(readOptional(env.REFINEMENT_PROVIDER, transcription.provider === 'whisper-cpp' ? 'local' : transcription.provider),
    'REFINEMENT_PROVIDER', ['openrouter', 'openai', 'local'] as const)
  if (provider === 'local') {
    return {
      provider,
      apiKey: readOptional(env.REFINEMENT_API_KEY, ''),
      baseUrl: readHttpUrl(env.REFINEMENT_BASE_URL, 'REFINEMENT_BASE_URL', 'http://localhost:11434/v1'),
      model: readRequired(env, 'REFINEMENT_MODEL'),
    }
  }
  return {
    provider,
    apiKey: env.REFINEMENT_API_KEY?.trim() || readRequired(env, provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY'),
    baseUrl: readOptional(env.REFINEMENT_BASE_URL, provider === 'openrouter'
      ? readOptional(env.OPENROUTER_BASE_URL, 'https://openrouter.ai/api/v1') : 'https://api.openai.com/v1'),
    model: readOptional(env.REFINEMENT_MODEL, provider === 'openrouter' ? 'openai/gpt-4.1-mini' : 'gpt-4.1-mini'),
  }
}

function readHttpUrl(value: string | undefined, name: string, fallback: string): string {
  const raw = readOptional(value, fallback)
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('Invalid base URL')
    }
    return raw.replace(/\/+$/, '')
  } catch {
    throw new ConfigurationError(`${name} must be an HTTP(S) base URL without credentials, query, or fragment`)
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
