import type { StorageConfig } from '../config/index.js'
import type { FileStorage } from './file-storage.js'
import { LocalFileStorage } from './local-file-storage.js'
import { S3FileStorage } from './s3-file-storage.js'

export function createFileStorage(config: StorageConfig): FileStorage {
  switch (config.provider) {
    case 'local':
      return new LocalFileStorage(config.rootPath)
    case 's3':
      return new S3FileStorage(config)
  }
}
