import type { Readable } from 'node:stream'
import {
  parseTranscriptionResponse,
  readAudio,
  resolveAudioMetadata,
} from './audio.js'
import {
  TranscriptionError,
  type AudioMetadata,
  type Transcriber,
} from './transcriber.js'

const supportedFormats = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'oga',
  'ogg',
  'wav',
  'webm',
])

export interface OpenRouterTranscriberOptions {
  apiKey: string
  baseUrl: string
  model: string
  fetch?: typeof globalThis.fetch
}

export class OpenRouterTranscriber implements Transcriber {
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly #model: string
  readonly #fetch: typeof globalThis.fetch

  constructor(options: OpenRouterTranscriberOptions) {
    if (!options.apiKey.trim()) {
      throw new TypeError('apiKey is required')
    }
    if (!options.baseUrl.trim()) {
      throw new TypeError('baseUrl is required')
    }
    if (!options.model.trim()) {
      throw new TypeError('model is required')
    }

    this.#apiKey = options.apiKey
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.#model = options.model
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async transcribe(
    audio: Readable,
    metadata: AudioMetadata,
    signal: AbortSignal,
  ): Promise<string> {
    const resolvedMetadata = resolveAudioMetadata(metadata, supportedFormats, 'OpenRouter')
    const contents = await readAudio(audio, signal, 'OpenRouter')

    try {
      const response = await this.#fetch(`${this.#baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.#model,
          input_audio: {
            data: contents.toString('base64'),
            format: resolvedMetadata.format,
          },
        }),
        signal,
      })

      return await parseTranscriptionResponse(response, 'OpenRouter')
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof TranscriptionError) {
        throw error
      }

      throw new TranscriptionError('OpenRouter transcription request failed', { cause: error })
    }
  }
}
