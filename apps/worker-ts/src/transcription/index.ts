import type { TranscriptionConfig } from '../config/index.js'
import { OpenAITranscriber } from './openai-transcriber.js'
import { OpenRouterTranscriber } from './openrouter-transcriber.js'
import type { Transcriber } from './transcriber.js'

export function createTranscriber(config: TranscriptionConfig): Transcriber {
  switch (config.provider) {
    case 'openrouter':
      return new OpenRouterTranscriber({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
      })
    case 'openai':
      return new OpenAITranscriber({ apiKey: config.apiKey })
  }
}
