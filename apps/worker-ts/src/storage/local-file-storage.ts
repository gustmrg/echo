import { open, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import type { Readable } from 'node:stream'
import {
  InvalidStorageKeyError,
  StorageReadError,
  type FileStorage,
} from './file-storage.js'

export class LocalFileStorage implements FileStorage {
  readonly #rootPath: string

  constructor(rootPath: string) {
    if (!rootPath.trim()) {
      throw new TypeError('rootPath is required')
    }

    this.#rootPath = resolve(rootPath)
  }

  async openReadStream(storageKey: string, signal: AbortSignal): Promise<Readable> {
    signal.throwIfAborted()
    const candidatePath = this.#resolveCandidatePath(storageKey)

    try {
      const [resolvedRoot, resolvedFile] = await Promise.all([
        realpath(this.#rootPath),
        realpath(candidatePath),
      ])
      assertPathContained(resolvedRoot, resolvedFile, storageKey)
      signal.throwIfAborted()

      const file = await open(resolvedFile, 'r')
      try {
        const fileInfo = await file.stat()
        if (!fileInfo.isFile()) {
          throw new StorageReadError(`Local storage key '${storageKey}' is not a file`)
        }

        signal.throwIfAborted()
        return file.createReadStream({ signal })
      } catch (error) {
        await file.close()
        throw error
      }
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof InvalidStorageKeyError || error instanceof StorageReadError) {
        throw error
      }

      throw new StorageReadError(`Could not open local storage key '${storageKey}'`, {
        cause: error,
      })
    }
  }

  #resolveCandidatePath(storageKey: string): string {
    const normalizedKey = validateStorageKey(storageKey)
    const candidatePath = resolve(this.#rootPath, normalizedKey)
    assertPathContained(this.#rootPath, candidatePath, storageKey)
    return candidatePath
  }
}

function validateStorageKey(storageKey: string): string {
  const normalizedKey = storageKey.trim().replaceAll('\\', '/')
  if (
    !normalizedKey ||
    normalizedKey.includes('\0') ||
    isAbsolute(normalizedKey) ||
    win32.isAbsolute(normalizedKey)
  ) {
    throw new InvalidStorageKeyError('A non-empty relative storage key is required')
  }

  return normalizedKey
}

function assertPathContained(rootPath: string, candidatePath: string, storageKey: string): void {
  const relativePath = relative(rootPath, candidatePath)
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new InvalidStorageKeyError(
      `Storage key '${storageKey}' does not identify a file inside the configured root`,
    )
  }
}
