import { extname } from 'node:path'
import { addAbortSignal, type Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import {
  TranscriptionError,
  UnsupportedAudioFormatError,
  type AudioMetadata,
} from './transcriber.js'

const contentTypesByFormat: Readonly<Record<string, string>> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  mp4: 'audio/mp4',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
}

export interface ResolvedAudioMetadata {
  fileName: string
  contentType: string
  format: string
}

export function resolveAudioMetadata(
  metadata: AudioMetadata,
  supportedFormats: ReadonlySet<string>,
  providerName: string,
): ResolvedAudioMetadata {
  const fileName = metadata.fileName.trim().replaceAll('\\', '/').split('/').at(-1)
  if (!fileName) {
    throw new UnsupportedAudioFormatError(`${providerName} requires an audio filename`)
  }

  const format = extname(fileName).slice(1).toLowerCase()
  if (!supportedFormats.has(format)) {
    throw new UnsupportedAudioFormatError(
      `Could not infer a supported ${providerName} audio format from filename '${metadata.fileName}'`,
    )
  }

  return {
    fileName,
    format,
    contentType: metadata.contentType?.trim() || contentTypesByFormat[format] ||
      'application/octet-stream',
  }
}

export async function readAudio(
  audio: Readable,
  signal: AbortSignal,
  providerName: string,
): Promise<Buffer> {
  signal.throwIfAborted()
  try {
    return await buffer(addAbortSignal(signal, audio))
  } catch (error) {
    signal.throwIfAborted()
    throw new TranscriptionError(`Could not read audio for ${providerName} transcription`, {
      cause: error,
    })
  }
}

export async function parseTranscriptionResponse(
  response: Response,
  providerName: string,
): Promise<string> {
  if (!response.ok) {
    const responseBody = (await response.text()).trim().slice(0, 4_096)
    const detail = responseBody ? `: ${responseBody}` : ''
    throw new TranscriptionError(
      `${providerName} transcription failed with status ${response.status}${detail}`,
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (error) {
    throw new TranscriptionError(`${providerName} transcription returned invalid JSON`, {
      cause: error,
    })
  }

  if (!isTranscriptionPayload(payload) || !payload.text.trim()) {
    throw new TranscriptionError(`${providerName} transcription response did not include text`)
  }

  return payload.text
}

function isTranscriptionPayload(payload: unknown): payload is { text: string } {
  return typeof payload === 'object' && payload !== null &&
    'text' in payload && typeof payload.text === 'string'
}
