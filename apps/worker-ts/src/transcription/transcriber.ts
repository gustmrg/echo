import type { Readable } from 'node:stream'

export interface AudioMetadata {
  fileName: string
  contentType: string | null
}

export interface Transcriber {
  transcribe(
    audio: Readable,
    metadata: AudioMetadata,
    signal: AbortSignal,
  ): Promise<string>
}
