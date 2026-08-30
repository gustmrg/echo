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

export class UnsupportedAudioFormatError extends Error {
  override readonly name = 'UnsupportedAudioFormatError'
}

export class TranscriptionError extends Error {
  override readonly name = 'TranscriptionError'
}
