import assert from 'node:assert/strict'
import { it } from 'node:test'
import { Readable } from 'node:stream'
import { access } from 'node:fs/promises'
import type { ReadStream } from 'node:fs'
import { processJob } from '../src/worker.js'
import type { JobMessage } from '../src/messaging/messages.js'
import type { Refiner } from '../src/refinement/refiner.js'
const job: JobMessage = { job_id: '00000000-0000-0000-0000-000000000001', claim_token: '00000000-0000-0000-0000-000000000002', kind: 'transcription', file_key: 'audio/test', file_name: 'test.wav' }
const refiner: Refiner = { async refine() { return { content: '# Notes', model: 'model', provider: 'test', promptVersion: '1' } } }
for (const failure of [false, true]) {
  it(`downloads to disk and removes the temporary file after ${failure ? 'failure' : 'success'}`, async () => {
    let path = ''
    const promise = processJob(job, { async openReadStream(key) { assert.equal(key, job.file_key); return Readable.from('audio') } },
      { async transcribe(audio) {
        path = String((audio as ReadStream).path)
        await access(path)
        if (failure) throw new Error('provider failed')
        let text = ''; for await (const chunk of audio) text += chunk
        assert.equal(text, 'audio'); return 'transcript'
      } }, refiner, new AbortController().signal)
    if (failure) await assert.rejects(promise, /provider failed/)
    else assert.equal((await promise).transcription_text, 'transcript')
    await assert.rejects(access(path))
  })
}
it('refines the message source without loading a database or audio', async () => {
  const result = await processJob({ ...job, kind: 'refinement', source_text: 'source', format: 'notes' },
    { async openReadStream() { throw new Error('must not open audio') } },
    { async transcribe() { throw new Error('must not transcribe') } }, refiner, new AbortController().signal)
  assert.equal(result.content, '# Notes'); assert.equal(result.prompt_version, '1')
})
