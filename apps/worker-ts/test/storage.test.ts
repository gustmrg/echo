import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { Readable } from 'node:stream'
import { afterEach, describe, it } from 'node:test'
import type { GetObjectCommand, GetObjectCommandOutput } from '@aws-sdk/client-s3'
import {
  InvalidStorageKeyError,
  StorageReadError,
} from '../src/storage/file-storage.js'
import { createFileStorage } from '../src/storage/index.js'
import { LocalFileStorage } from '../src/storage/local-file-storage.js'
import {
  S3FileStorage,
  type S3ObjectClient,
} from '../src/storage/s3-file-storage.js'

const abortSignal = new AbortController().signal
const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('LocalFileStorage', () => {
  it('streams a file beneath the configured storage root', async () => {
    const root = createTemporaryRoot()
    const directory = join(root, 'recordings', 'recording-id')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'audio.webm'), 'audio bytes')
    const storage = new LocalFileStorage(root)

    const stream = await storage.openReadStream(
      'recordings/recording-id/audio.webm',
      abortSignal,
    )

    assert.equal((await buffer(stream)).toString(), 'audio bytes')
  })

  it('accepts storage keys with Windows separators', async () => {
    const root = createTemporaryRoot()
    const directory = join(root, 'recordings', 'recording-id')
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'audio.webm'), 'audio bytes')
    const storage = new LocalFileStorage(root)

    const stream = await storage.openReadStream(
      'recordings\\recording-id\\audio.webm',
      abortSignal,
    )

    assert.equal((await buffer(stream)).toString(), 'audio bytes')
  })

  it('rejects traversal and absolute storage keys', async () => {
    const root = createTemporaryRoot()
    const storage = new LocalFileStorage(root)

    await assert.rejects(
      storage.openReadStream('../outside.webm', abortSignal),
      InvalidStorageKeyError,
    )
    await assert.rejects(
      storage.openReadStream('/outside.webm', abortSignal),
      InvalidStorageKeyError,
    )
    await assert.rejects(
      storage.openReadStream('C:\\outside.webm', abortSignal),
      InvalidStorageKeyError,
    )
  })

  it('rejects symlinks that escape the configured storage root', async () => {
    const root = createTemporaryRoot()
    const outsideRoot = createTemporaryRoot()
    writeFileSync(join(outsideRoot, 'audio.webm'), 'outside bytes')
    symlinkSync(outsideRoot, join(root, 'escaped'), process.platform === 'win32' ? 'junction' : 'dir')
    const storage = new LocalFileStorage(root)

    await assert.rejects(
      storage.openReadStream('escaped/audio.webm', abortSignal),
      InvalidStorageKeyError,
    )
  })

  it('wraps filesystem failures with storage context', async () => {
    const root = createTemporaryRoot()
    const storage = new LocalFileStorage(root)

    await assert.rejects(
      storage.openReadStream('recordings/missing.webm', abortSignal),
      (error: unknown) =>
        error instanceof StorageReadError &&
        error.message === "Could not open local storage key 'recordings/missing.webm'" &&
        error.cause instanceof Error,
    )
  })

  it('honors cancellation before touching the filesystem', async () => {
    const root = createTemporaryRoot()
    const storage = new LocalFileStorage(root)
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      storage.openReadStream('recordings/audio.webm', controller.signal),
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    )
  })
})

describe('S3FileStorage', () => {
  it('requests and returns the configured S3 object stream', async () => {
    const client = new FakeS3Client({
      $metadata: {},
      Body: Readable.from(['audio bytes']) as NonNullable<GetObjectCommandOutput['Body']>,
    })
    const storage = new S3FileStorage({
      bucket: 'echo-production',
      region: 'sa-east-1',
      client,
    })

    const stream = await storage.openReadStream('recordings/id/audio.webm', abortSignal)

    assert.equal((await buffer(stream)).toString(), 'audio bytes')
    assert.equal(client.command?.input.Bucket, 'echo-production')
    assert.equal(client.command?.input.Key, 'recordings/id/audio.webm')
    assert.equal(client.signal, abortSignal)
  })

  it('rejects empty object keys before calling S3', async () => {
    const client = new FakeS3Client({ $metadata: {} })
    const storage = new S3FileStorage({
      bucket: 'echo-production',
      region: 'sa-east-1',
      client,
    })

    await assert.rejects(
      storage.openReadStream('  ', abortSignal),
      InvalidStorageKeyError,
    )
    assert.equal(client.command, undefined)
  })

  it('wraps S3 client failures while retaining the cause', async () => {
    const clientError = new Error('access denied')
    const client = new FakeS3Client(clientError)
    const storage = new S3FileStorage({
      bucket: 'echo-production',
      region: 'sa-east-1',
      client,
    })

    await assert.rejects(
      storage.openReadStream('recordings/id/audio.webm', abortSignal),
      (error: unknown) =>
        error instanceof StorageReadError &&
        error.message === "Could not open S3 object 'recordings/id/audio.webm'" &&
        error.cause === clientError,
    )
  })

  it('rejects an S3 response without a Node.js stream body', async () => {
    const client = new FakeS3Client({ $metadata: {} })
    const storage = new S3FileStorage({
      bucket: 'echo-production',
      region: 'sa-east-1',
      client,
    })

    await assert.rejects(
      storage.openReadStream('recordings/id/audio.webm', abortSignal),
      StorageReadError,
    )
  })
})

describe('createFileStorage', () => {
  it('selects the configured storage adapter', () => {
    const localStorage = createFileStorage({ provider: 'local', rootPath: '/data/files' })
    const s3Storage = createFileStorage({
      provider: 's3',
      bucket: 'echo-production',
      region: 'sa-east-1',
    })

    assert.ok(localStorage instanceof LocalFileStorage)
    assert.ok(s3Storage instanceof S3FileStorage)
  })
})

class FakeS3Client implements S3ObjectClient {
  command: GetObjectCommand | undefined
  signal: AbortSignal | undefined

  readonly #result: GetObjectCommandOutput | Error

  constructor(result: GetObjectCommandOutput | Error) {
    this.#result = result
  }

  async send(
    command: GetObjectCommand,
    options: { abortSignal: AbortSignal },
  ): Promise<GetObjectCommandOutput> {
    this.command = command
    this.signal = options.abortSignal
    if (this.#result instanceof Error) {
      throw this.#result
    }

    return this.#result
  }
}

function createTemporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'echo-worker-storage-'))
  temporaryRoots.push(root)
  return root
}
