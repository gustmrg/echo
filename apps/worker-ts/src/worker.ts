import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { JobMessage, JobResult } from './messaging/messages.js'
import type { FileStorage } from './storage/file-storage.js'
import type { Transcriber } from './transcription/transcriber.js'
import type { Refiner } from './refinement/refiner.js'

export async function processJob(job: JobMessage, storage: FileStorage, transcriber: Transcriber,
  refiner: Refiner, signal: AbortSignal): Promise<JobResult> {
  const identity = {
    job_id: job.job_id,
    claim_token: job.claim_token,
    kind: job.kind,
    ...(job.correlation_id ? { correlation_id: job.correlation_id } : {}),
  }
  if (job.kind === 'refinement') {
    const result = await refiner.refine(job.source_text!, job.format!, signal)
    signal.throwIfAborted()
    return { ...identity, status: 'completed', content: result.content, model: result.model,
      provider: result.provider, prompt_version: result.promptVersion }
  }
  const directory = await mkdtemp(join(tmpdir(), 'echo-audio-'))
  try {
    // Use a generated directory and fixed filename: the message cannot choose a local path.
    const path = join(directory, 'audio')
    const input = await storage.openReadStream(job.file_key!, signal)
    await pipeline(input, createWriteStream(path, { mode: 0o600, flags: 'wx' }), { signal })
    const audio = createReadStream(path)
    try {
      const text = await transcriber.transcribe(audio,
        { fileName: job.file_name!, contentType: job.content_type ?? null }, signal)
      signal.throwIfAborted()
      return { ...identity, status: 'completed', transcription_text: text }
    } finally { audio.destroy() }
  } finally { await rm(directory, { recursive: true, force: true }) }
}
