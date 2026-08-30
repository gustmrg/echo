import type { Readable } from 'node:stream'

export interface FileStorage {
  openReadStream(storageKey: string, signal: AbortSignal): Promise<Readable>
}

export class InvalidStorageKeyError extends Error {
  override readonly name = 'InvalidStorageKeyError'
}

export class StorageReadError extends Error {
  override readonly name = 'StorageReadError'
}
