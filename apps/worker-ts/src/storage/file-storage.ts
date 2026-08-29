import type { Readable } from 'node:stream'

export interface FileStorage {
  openReadStream(storageKey: string, signal: AbortSignal): Promise<Readable>
}
