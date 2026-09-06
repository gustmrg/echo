import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runProcess } from './process.js'

export interface WhisperCppOptions {
  modelPath: string
  binaryPath: string
  ffmpegPath: string
  language: string
  threads: number
  useGpu: boolean
}

/** Node-compatible file engine; has no queue, storage, environment or Electron dependencies. */
export class WhisperCppEngine {
  constructor(private readonly options: WhisperCppOptions,
    private readonly run: typeof runProcess = runProcess) {}

  async transcribeFile(inputPath: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const modelPath = resolve(this.options.modelPath)
    if (!(await stat(modelPath)).isFile()) throw new Error('Whisper model path must be a file')
    const directory = await mkdtemp(join(tmpdir(), 'echo-whisper-'))
    try {
      const wav = join(directory, 'audio.wav')
      const output = join(directory, 'transcript')
      await this.run(this.options.ffmpegPath, ['-nostdin', '-hide_banner', '-loglevel', 'error',
        '-protocol_whitelist', 'file,pipe', '-i', resolve(inputPath), '-vn', '-ar', '16000', '-ac', '1',
        '-c:a', 'pcm_s16le', '-y', wav], signal)
      signal.throwIfAborted()
      await this.run(this.options.binaryPath, ['--model', modelPath, '--file', wav,
        '--language', this.options.language, '--threads', String(this.options.threads),
        '--output-txt', '--output-file', output, '--no-prints',
        ...(this.options.useGpu ? [] : ['--no-gpu'])], signal)
      signal.throwIfAborted()
      const text = (await readFile(`${output}.txt`, 'utf8')).trim()
      if (!text) throw new Error('Whisper transcription did not include text')
      return text
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
}
