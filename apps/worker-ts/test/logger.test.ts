import assert from 'node:assert/strict'
import { it } from 'node:test'
import { createLogger } from '../src/logging/logger.js'

it('writes structured logs and preserves child context', () => {
  const lines: string[] = []
  const logger = createLogger({ service: 'echo-worker' }, (line) => lines.push(line))

  logger.child({ jobId: 'job-1', recordingId: 'recording-1' }).info('Job claimed')

  assert.equal(lines.length, 1)
  const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>
  assert.equal(entry.service, 'echo-worker')
  assert.equal(entry.jobId, 'job-1')
  assert.equal(entry.recordingId, 'recording-1')
  assert.equal(entry.level, 'info')
  assert.equal(entry.message, 'Job claimed')
  assert.equal(typeof entry.timestamp, 'string')
})

it('serializes errors without throwing', () => {
  const lines: string[] = []
  const logger = createLogger({}, (line) => lines.push(line))

  logger.error('Processing failed', new Error('provider unavailable'), { jobId: 'job-1' })

  const entry = JSON.parse(lines[0] ?? '{}') as {
    error: { name: string; message: string }
  }
  assert.equal(entry.error.name, 'Error')
  assert.equal(entry.error.message, 'provider unavailable')
})
