// Run after build with a real model/audio fixture; no broker or cloud calls.
import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'
import { createTranscriber } from '../dist/transcription/index.js'
import { processJob } from '../dist/worker.js'

const modelPath = process.env.WHISPER_MODEL_PATH
const audioPath = process.env.WHISPER_TEST_AUDIO
assert.ok(modelPath, 'WHISPER_MODEL_PATH is required')
assert.ok(audioPath, 'WHISPER_TEST_AUDIO is required')
const transcriber = createTranscriber({ provider: 'whisper-cpp', modelPath,
  binaryPath: process.env.WHISPER_BINARY_PATH || 'whisper-cli',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg', language: 'auto', threads: 2, useGpu: false })
const result = await processJob({ job_id: 'smoke-job', claim_token: 'smoke-claim', kind: 'transcription',
  file_key: 'fixture', file_name: basename(audioPath) },
{ async openReadStream() { return createReadStream(audioPath) } }, transcriber,
{ async refine() { throw new Error('unexpected refinement') } }, AbortSignal.timeout(120000))
assert.equal(result.status, 'completed')
assert.ok(result.transcription_text?.trim())
if (process.env.WHISPER_TEST_EXPECTED) {
  assert.ok(result.transcription_text.toLowerCase().includes(process.env.WHISPER_TEST_EXPECTED.toLowerCase()))
}
console.log(result.transcription_text)
