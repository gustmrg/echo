import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'
import { createTranscriber } from '../src/transcription/index.js'
import { OpenAITranscriber } from '../src/transcription/openai-transcriber.js'
import { OpenRouterTranscriber } from '../src/transcription/openrouter-transcriber.js'
import {
  TranscriptionError,
  UnsupportedAudioFormatError,
} from '../src/transcription/transcriber.js'

const abortSignal = new AbortController().signal

describe('OpenRouterTranscriber', () => {
  it('sends the configured model and base64 audio to OpenRouter', async () => {
    let receivedUrl: string | undefined
    let receivedInit: RequestInit | undefined
    const fakeFetch: typeof fetch = async (input, init) => {
      receivedUrl = String(input)
      receivedInit = init
      return jsonResponse({ text: 'hello from OpenRouter' })
    }
    const transcriber = new OpenRouterTranscriber({
      apiKey: 'openrouter-key',
      baseUrl: 'https://openrouter.example/api/v1/',
      model: 'openai/whisper-1',
      fetch: fakeFetch,
    })

    const transcript = await transcriber.transcribe(
      Readable.from(['audio bytes']),
      { fileName: 'recording.mp3', contentType: 'audio/mpeg' },
      abortSignal,
    )

    assert.equal(transcript, 'hello from OpenRouter')
    assert.equal(receivedUrl, 'https://openrouter.example/api/v1/audio/transcriptions')
    assert.equal(receivedInit?.method, 'POST')
    assert.equal(new Headers(receivedInit?.headers).get('authorization'), 'Bearer openrouter-key')
    assert.equal(new Headers(receivedInit?.headers).get('content-type'), 'application/json')
    assert.deepEqual(JSON.parse(receivedInit?.body as string), {
      model: 'openai/whisper-1',
      input_audio: {
        data: Buffer.from('audio bytes').toString('base64'),
        format: 'mp3',
      },
    })
    assert.equal(receivedInit?.signal, abortSignal)
  })

  it('rejects unsupported filenames before making a request', async () => {
    let requestCount = 0
    const transcriber = new OpenRouterTranscriber({
      apiKey: 'openrouter-key',
      baseUrl: 'https://openrouter.example/api/v1',
      model: 'openai/whisper-1',
      fetch: async () => {
        requestCount += 1
        return jsonResponse({ text: 'unexpected' })
      },
    })

    await assert.rejects(
      transcriber.transcribe(
        Readable.from(['audio bytes']),
        { fileName: 'recording', contentType: 'audio/mpeg' },
        abortSignal,
      ),
      UnsupportedAudioFormatError,
    )
    assert.equal(requestCount, 0)
  })

  it('returns bounded provider details for non-success responses', async () => {
    const transcriber = new OpenRouterTranscriber({
      apiKey: 'openrouter-key',
      baseUrl: 'https://openrouter.example/api/v1',
      model: 'openai/whisper-1',
      fetch: async () => new Response(`rate limited ${'x'.repeat(5_000)}`, { status: 429 }),
    })

    await assert.rejects(
      transcriber.transcribe(
        Readable.from(['audio bytes']),
        { fileName: 'recording.wav', contentType: 'audio/wav' },
        abortSignal,
      ),
      (error: unknown) =>
        error instanceof TranscriptionError &&
        error.message.startsWith('OpenRouter transcription failed with status 429: rate limited') &&
        error.message.length < 4_200,
    )
  })

  it('rejects a successful response without transcription text', async () => {
    const transcriber = new OpenRouterTranscriber({
      apiKey: 'openrouter-key',
      baseUrl: 'https://openrouter.example/api/v1',
      model: 'openai/whisper-1',
      fetch: async () => jsonResponse({ text: '   ' }),
    })

    await assert.rejects(
      transcriber.transcribe(
        Readable.from(['audio bytes']),
        { fileName: 'recording.webm', contentType: 'audio/webm' },
        abortSignal,
      ),
      TranscriptionError,
    )
  })
})

describe('OpenAITranscriber', () => {
  it('uploads multipart audio using the direct OpenAI transcription model', async () => {
    let receivedUrl: string | undefined
    let receivedInit: RequestInit | undefined
    const fakeFetch: typeof fetch = async (input, init) => {
      receivedUrl = String(input)
      receivedInit = init
      return jsonResponse({ text: 'hello from OpenAI' })
    }
    const transcriber = new OpenAITranscriber({
      apiKey: 'openai-key',
      fetch: fakeFetch,
    })

    const transcript = await transcriber.transcribe(
      Readable.from(['audio bytes']),
      { fileName: 'folder\\recording.webm', contentType: 'audio/webm;codecs=opus' },
      abortSignal,
    )

    assert.equal(transcript, 'hello from OpenAI')
    assert.equal(receivedUrl, 'https://api.openai.com/v1/audio/transcriptions')
    assert.equal(receivedInit?.method, 'POST')
    assert.equal(new Headers(receivedInit?.headers).get('authorization'), 'Bearer openai-key')
    assert.equal(new Headers(receivedInit?.headers).has('content-type'), false)
    assert.equal(receivedInit?.signal, abortSignal)

    const form = receivedInit?.body
    assert.ok(form instanceof FormData)
    assert.equal(form.get('model'), 'gpt-4o-transcribe')
    assert.equal(form.get('response_format'), 'json')
    const audioFile = form.get('file')
    assert.ok(audioFile instanceof File)
    assert.equal(audioFile.name, 'recording.webm')
    assert.equal(audioFile.type, 'audio/webm;codecs=opus')
    assert.equal(await audioFile.text(), 'audio bytes')
  })

  it('infers a content type when recording metadata does not provide one', async () => {
    let receivedFile: File | undefined
    const transcriber = new OpenAITranscriber({
      apiKey: 'openai-key',
      fetch: async (_input, init) => {
        const form = init?.body
        assert.ok(form instanceof FormData)
        const file = form.get('file')
        assert.ok(file instanceof File)
        receivedFile = file
        return jsonResponse({ text: 'transcript' })
      },
    })

    await transcriber.transcribe(
      Readable.from(['audio bytes']),
      { fileName: 'recording.mp3', contentType: null },
      abortSignal,
    )

    assert.equal(receivedFile?.type, 'audio/mpeg')
  })

  it('wraps network failures while retaining the cause', async () => {
    const networkError = new Error('connection reset')
    const transcriber = new OpenAITranscriber({
      apiKey: 'openai-key',
      fetch: async () => { throw networkError },
    })

    await assert.rejects(
      transcriber.transcribe(
        Readable.from(['audio bytes']),
        { fileName: 'recording.wav', contentType: 'audio/wav' },
        abortSignal,
      ),
      (error: unknown) =>
        error instanceof TranscriptionError &&
        error.message === 'OpenAI transcription request failed' &&
        error.cause === networkError,
    )
  })

  it('honors cancellation while a provider request is running', async () => {
    const controller = new AbortController()
    let markRequestStarted: (() => void) | undefined
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve
    })
    const transcriber = new OpenAITranscriber({
      apiKey: 'openai-key',
      fetch: async (_input, init) => await new Promise<Response>((_resolve, reject) => {
        markRequestStarted?.()
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      }),
    })

    const transcription = transcriber.transcribe(
      Readable.from(['audio bytes']),
      { fileName: 'recording.wav', contentType: 'audio/wav' },
      controller.signal,
    )
    await requestStarted
    controller.abort()

    await assert.rejects(
      transcription,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    )
  })

  it('rejects malformed JSON returned by OpenAI', async () => {
    const transcriber = new OpenAITranscriber({
      apiKey: 'openai-key',
      fetch: async () => new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    })

    await assert.rejects(
      transcriber.transcribe(
        Readable.from(['audio bytes']),
        { fileName: 'recording.wav', contentType: 'audio/wav' },
        abortSignal,
      ),
      (error: unknown) =>
        error instanceof TranscriptionError &&
        error.message === 'OpenAI transcription returned invalid JSON',
    )
  })
})

describe('createTranscriber', () => {
  it('selects the configured transcription adapter', () => {
    const openRouter = createTranscriber({
      provider: 'openrouter',
      apiKey: 'openrouter-key',
      baseUrl: 'https://openrouter.example/api/v1',
      model: 'openai/whisper-1',
    })
    const openAI = createTranscriber({ provider: 'openai', apiKey: 'openai-key' })

    assert.ok(openRouter instanceof OpenRouterTranscriber)
    assert.ok(openAI instanceof OpenAITranscriber)
  })
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
