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

const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'
const OPENAI_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe'
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

export interface OpenAITranscriberOptions {
  apiKey: string
  fetch?: typeof globalThis.fetch
}

export class OpenAITranscriber implements Transcriber {
  readonly #apiKey: string
  readonly #fetch: typeof globalThis.fetch

  constructor(options: OpenAITranscriberOptions) {
    if (!options.apiKey.trim()) {
      throw new TypeError('apiKey is required')
    }

    this.#apiKey = options.apiKey
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async transcribe(
    audio: Readable,
    metadata: AudioMetadata,
    signal: AbortSignal,
  ): Promise<string> {
    const resolvedMetadata = resolveAudioMetadata(metadata, supportedFormats, 'OpenAI')
    const contents = await readAudio(audio, signal, 'OpenAI')
    const form = new FormData()
    form.append(
      'file',
      new File([contents], resolvedMetadata.fileName, { type: resolvedMetadata.contentType }),
    )
    form.append('model', OPENAI_TRANSCRIPTION_MODEL)
    form.append('response_format', 'json')

    try {
      const response = await this.#fetch(OPENAI_TRANSCRIPTION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.#apiKey}` },
        body: form,
        signal,
      })

      return await parseTranscriptionResponse(response, 'OpenAI')
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof TranscriptionError) {
        throw error
      }

      throw new TranscriptionError('OpenAI transcription request failed', { cause: error })
    }
  }
}
