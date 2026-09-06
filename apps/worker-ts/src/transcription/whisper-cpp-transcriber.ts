import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { resolveAudioMetadata } from './audio.js'
import { TranscriptionError, type AudioMetadata, type Transcriber } from './transcriber.js'
import { WhisperCppEngine, type WhisperCppOptions } from './whisper-cpp/engine.js'

const formats = new Set(['aac', 'flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'])

/** Adapts the worker stream contract to the reusable file engine. */
export class WhisperCppTranscriber implements Transcriber {
  private readonly engine: WhisperCppEngine
  constructor(options: WhisperCppOptions) { this.engine = new WhisperCppEngine(options) }

  async transcribe(audio: Readable, metadata: AudioMetadata, signal: AbortSignal): Promise<string> {
    resolveAudioMetadata(metadata, formats, 'whisper.cpp')
    signal.throwIfAborted()
    const directory = await mkdtemp(join(tmpdir(), 'echo-whisper-input-'))
    try {
      const path = join(directory, 'input')
      await pipeline(audio, createWriteStream(path, { mode: 0o600, flags: 'wx' }), { signal })
      return await this.engine.transcribeFile(path, signal)
    } catch (error) {
      signal.throwIfAborted()
      throw new TranscriptionError('whisper.cpp transcription failed', { cause: error })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
