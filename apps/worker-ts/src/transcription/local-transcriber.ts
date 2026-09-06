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
  'flac',
  'm4a',
  'mp3',
  'mp4',
  'mpeg',
  'mpga',
  'ogg',
  'wav',
  'webm',
])

export interface LocalTranscriberOptions {
  apiKey: string
  baseUrl: string
  model: string
  fetch?: typeof globalThis.fetch
}

export class LocalTranscriber implements Transcriber {
  readonly #baseUrl: string
  readonly #model: string
  readonly #apiKey: string
  readonly #fetch: typeof globalThis.fetch

  constructor(options: LocalTranscriberOptions) {
    if (!options.baseUrl.trim() || !options.model.trim()) {
      throw new TypeError('baseUrl and model are required')
    }
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.#model = options.model

    this.#apiKey = options.apiKey
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async transcribe(
    audio: Readable,
    metadata: AudioMetadata,
    signal: AbortSignal,
  ): Promise<string> {
    const resolvedMetadata = resolveAudioMetadata(metadata, supportedFormats, 'Local')
    const contents = await readAudio(audio, signal, 'Local')
    const form = new FormData()
    form.append(
      'file',
      new File([contents], resolvedMetadata.fileName, { type: resolvedMetadata.contentType }),
    )
    form.append('model', this.#model)
    form.append('response_format', 'json')

    try {
      const response = await this.#fetch(`${this.#baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: this.#apiKey ? { Authorization: `Bearer ${this.#apiKey}` } : {},
        body: form,
        signal,
      })

      return await parseTranscriptionResponse(response, 'Local')
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof TranscriptionError) {
        throw error
      }

      throw new TranscriptionError('Local transcription request failed', { cause: error })
    }
  }
}
