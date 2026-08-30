import {
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import {
  InvalidStorageKeyError,
  StorageReadError,
  type FileStorage,
} from './file-storage.js'

export interface S3ObjectClient {
  send(
    command: GetObjectCommand,
    options: { abortSignal: AbortSignal },
  ): Promise<GetObjectCommandOutput>
}

export interface S3FileStorageOptions {
  bucket: string
  region: string
  client?: S3ObjectClient
}

export class S3FileStorage implements FileStorage {
  readonly #bucket: string
  readonly #client: S3ObjectClient

  constructor(options: S3FileStorageOptions) {
    if (!options.bucket.trim()) {
      throw new TypeError('bucket is required')
    }
    if (!options.region.trim()) {
      throw new TypeError('region is required')
    }

    this.#bucket = options.bucket
    this.#client = options.client ?? new S3Client({ region: options.region })
  }

  async openReadStream(storageKey: string, signal: AbortSignal): Promise<Readable> {
    const key = storageKey.trim()
    if (!key) {
      throw new InvalidStorageKeyError('A non-empty S3 storage key is required')
    }

    signal.throwIfAborted()
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
        { abortSignal: signal },
      )
      signal.throwIfAborted()

      if (!(response.Body instanceof Readable)) {
        throw new StorageReadError(`S3 object '${key}' did not return a Node.js readable stream`)
      }

      return response.Body
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof StorageReadError) {
        throw error
      }

      throw new StorageReadError(`Could not open S3 object '${key}'`, { cause: error })
    }
  }
}
