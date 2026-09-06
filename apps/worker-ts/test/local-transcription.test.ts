import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { it } from 'node:test'
import { loadConfig } from '../src/config/index.js'
import { createTranscriber } from '../src/transcription/index.js'
import { LocalTranscriber } from '../src/transcription/local-transcriber.js'
import { TranscriptionError, UnsupportedAudioFormatError } from '../src/transcription/transcriber.js'
import { processJob } from '../src/worker.js'

const options = { apiKey: '', baseUrl: 'http://localhost:8000/v1/', model: 'local-whisper' }
const metadata = { fileName: 'recording.webm', contentType: 'audio/webm;codecs=opus' }

it('processes a job through the configured local HTTP server with multipart audio and no cloud key', async (t) => {
  let received: { path: string | undefined; authorization: string | undefined; form: FormData } | undefined
  const server = createServer(async (req, res) => {
    try {
      const request = new Request('http://localhost', { method: 'POST',
        headers: { 'Content-Type': req.headers['content-type']! }, body: await buffer(req) })
      received = { path: req.url, authorization: req.headers.authorization, form: await request.formData() }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ text: 'Transcrição local em português.' }))
    } catch {
      res.writeHead(500).end()
    }
  })
  t.after(() => { server.closeAllConnections(); server.close() })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const config = loadConfig({ RABBITMQ_URL: 'amqp://localhost', STORAGE_PROVIDER: 'local', STORAGE_LOCAL_ROOT: '/tmp',
    TRANSCRIPTION_PROVIDER: 'local', LOCAL_TRANSCRIPTION_MODEL: 'local-whisper',
    LOCAL_TRANSCRIPTION_BASE_URL: `http://127.0.0.1:${address.port}/v1/`, REFINEMENT_MODEL: 'local-chat' })
  const result = await processJob({ job_id: 'job', claim_token: 'claim', kind: 'transcription',
    file_key: 'audio/test', file_name: metadata.fileName, content_type: metadata.contentType },
  { async openReadStream() { return Readable.from(['audio bytes']) } }, createTranscriber(config.transcription),
  { async refine() { throw new Error('unexpected refinement') } }, new AbortController().signal)
  assert.equal(result.status, 'completed')
  assert.equal(result.transcription_text, 'Transcrição local em português.')
  assert.equal(received?.path, '/v1/audio/transcriptions')
  assert.equal(received?.authorization, undefined)
  assert.equal(received?.form.get('model'), 'local-whisper')
  assert.equal(received?.form.get('response_format'), 'json')
  const file = received?.form.get('file')
  assert.ok(file instanceof File)
  assert.equal(file.name, metadata.fileName)
  assert.equal(file.type, metadata.contentType)
  assert.equal(await file.text(), 'audio bytes')
})

it('sends an optional local API key without overriding the multipart content type', async () => {
  const transcriber = new LocalTranscriber({ ...options, apiKey: 'local-key', fetch: async (url, init) => {
    assert.equal(url, 'http://localhost:8000/v1/audio/transcriptions')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer local-key')
    assert.equal(new Headers(init?.headers).has('content-type'), false)
    return Response.json({ text: 'text' })
  } })
  assert.equal(await transcriber.transcribe(Readable.from(['audio']), metadata, new AbortController().signal), 'text')
})

it('rejects unsupported audio before contacting the local server', async () => {
  const transcriber = new LocalTranscriber({ ...options, fetch: async () => { assert.fail('unexpected request') } })
  await assert.rejects(transcriber.transcribe(Readable.from(['audio']), { fileName: 'file.txt', contentType: null },
    new AbortController().signal), UnsupportedAudioFormatError)
})

it('reports local failures without falling back to a cloud provider', async () => {
  for (const response of [new Response('unavailable', { status: 503 }), new Response('invalid JSON'),
    Response.json({ text: '' }), Response.json({ choices: [] })]) {
    const transcriber = new LocalTranscriber({ ...options, fetch: async () => response })
    await assert.rejects(transcriber.transcribe(Readable.from(['audio']), metadata, new AbortController().signal), TranscriptionError)
  }
  const cause = new Error('connection refused')
  const transcriber = new LocalTranscriber({ ...options, fetch: async () => { throw cause } })
  await assert.rejects(transcriber.transcribe(Readable.from(['audio']), metadata, new AbortController().signal),
    (error: unknown) => error instanceof TranscriptionError && error.cause === cause)
})

it('aborts an in-flight local request when the job times out or shuts down', async () => {
  const controller = new AbortController()
  const started = Promise.withResolvers<void>()
  const transcriber = new LocalTranscriber({ ...options, fetch: async (_url, init) => {
    started.resolve()
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    })
  } })
  const pending = transcriber.transcribe(Readable.from(['audio']), metadata, controller.signal)
  await started.promise
  controller.abort()
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError')
})
