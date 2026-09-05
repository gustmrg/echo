import { RefinementStore } from '../src/refinement/store.js'
import assert from 'node:assert/strict'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { StoreStateConflictError } from '../src/db/store.js'
import { SqliteStore } from '../src/db/sqlite-store.js'

const fixedNow = new Date('2026-08-29T20:00:00.000Z')
const processingLeaseMs = 15 * 60_000
const abortSignal = new AbortController().signal

let temporaryRoot: string
let templateDatabasePath: string

before(() => {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'echo-worker-store-'))
  templateDatabasePath = join(temporaryRoot, 'migrated-template.db')

  const apiProject = new URL('../../api/Echo.API/Echo.API.csproj', import.meta.url).pathname
  const migration = spawnSync(
    'dotnet',
    [
      'ef',
      'database',
      'update',
      '--project',
      apiProject,
      '--startup-project',
      apiProject,
      '--connection',
      `Data Source=${templateDatabasePath}`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: 'Development',
        BaseOutputPath: `${join(temporaryRoot, 'dotnet-build')}/`,
      },
      timeout: 120_000,
    },
  )

  assert.equal(
    migration.status,
    0,
    `EF migration failed.\n${migration.stdout}\n${migration.stderr}`,
  )
})

after(() => {
  rmSync(temporaryRoot, { recursive: true, force: true })
})

describe('SqliteStore', () => {
  it('reads recordings from the schema produced by the API migrations', async () => {
    const databasePath = createMigratedDatabase()
    const ids = insertRecordingAndJob(databasePath)
    const database = new DatabaseSync(databasePath)
    const recordingColumns = database.prepare('PRAGMA table_info(recordings)').all()
    const jobColumns = database.prepare('PRAGMA table_info(transcription_jobs)').all()
    database.close()

    assert.ok(recordingColumns.some((column) => column.name === 'storage_key'))
    assert.ok(!recordingColumns.some((column) => column.name === 's3_key'))
    assert.ok(!jobColumns.some((column) => column.name === 'raw_text'))

    const store = createStore(databasePath)
    const recording = await store.getRecording(ids.recordingId, abortSignal)
    await store.close()

    assert.equal(recording?.storageKey, `audio-recordings/${ids.recordingId}/audio.webm`)
    assert.equal(recording?.fileSizeBytes, 1_024)
    assert.equal(recording?.status, 'pending')
  })

  it('atomically claims the oldest eligible job and marks its recording as transcribing', async () => {
    const databasePath = createMigratedDatabase()
    const newer = insertRecordingAndJob(databasePath, {
      createdAt: '2026-08-29T19:30:00.000Z',
    })
    const older = insertRecordingAndJob(databasePath, {
      createdAt: '2026-08-29T19:00:00.000Z',
    })
    const store = createStore(databasePath)

    const claimed = await store.claimNextJob(abortSignal)
    await store.close()

    assert.equal(claimed?.id, older.jobId)
    assert.equal(claimed?.status, 'processing')
    assert.equal(readStatus(databasePath, 'transcription_jobs', older.jobId), 'processing')
    assert.equal(readStatus(databasePath, 'recordings', older.recordingId), 'transcribing')
    assert.equal(readStatus(databasePath, 'transcription_jobs', newer.jobId), 'created')
    assert.equal(readStatus(databasePath, 'recordings', newer.recordingId), 'pending')
  })

  it('does not allow two store instances to claim the same job', async () => {
    const databasePath = createMigratedDatabase()
    const ids = insertRecordingAndJob(databasePath)
    const firstStore = createStore(databasePath)
    const secondStore = createStore(databasePath)

    const [firstClaim, secondClaim] = await Promise.all([
      firstStore.claimNextJob(abortSignal),
      secondStore.claimNextJob(abortSignal),
    ])
    await Promise.all([firstStore.close(), secondStore.close()])

    assert.equal(firstClaim?.id, ids.jobId)
    assert.equal(secondClaim, null)
  })

  it('completes the job and recording together and stores the transcript on the recording', async () => {
    const databasePath = createMigratedDatabase()
    const ids = insertRecordingAndJob(databasePath)
    const store = createStore(databasePath)
    const job = await store.claimNextJob(abortSignal)
    assert.ok(job)

    await store.completeJob(job, 'A polished transcript.', abortSignal)
    await store.close()

    const database = new DatabaseSync(databasePath)
    const row = database.prepare(`
      SELECT
        j.status AS jobStatus,
        j.failure_reason AS failureReason,
        r.status AS recordingStatus,
        r.transcribed_text AS transcript
      FROM transcription_jobs AS j
      INNER JOIN recordings AS r ON r.id = j.recording_id
      WHERE j.id = ?
    `).get(ids.jobId)
    database.close()

    assert.deepEqual({ ...row }, {
      jobStatus: 'completed',
      failureReason: null,
      recordingStatus: 'transcribed',
      transcript: 'A polished transcript.',
    })
  })

  it('fails the job and recording together, increments retries, and bounds the reason', async () => {
    const databasePath = createMigratedDatabase()
    const ids = insertRecordingAndJob(databasePath, { retryCount: 2 })
    const store = createStore(databasePath)
    const job = await store.claimNextJob(abortSignal)
    assert.ok(job)

    await store.failJob(job, `  ${'x'.repeat(3_000)}  `, abortSignal)
    await store.close()

    const database = new DatabaseSync(databasePath)
    const row = database.prepare(`
      SELECT
        j.status AS jobStatus,
        j.failure_reason AS failureReason,
        j.retry_count AS retryCount,
        r.status AS recordingStatus
      FROM transcription_jobs AS j
      INNER JOIN recordings AS r ON r.id = j.recording_id
      WHERE j.id = ?
    `).get(ids.jobId)
    database.close()

    assert.equal(row?.jobStatus, 'failed')
    assert.equal(row?.recordingStatus, 'failed')
    assert.equal(row?.retryCount, 3)
    assert.equal((row?.failureReason as string).length, 2_048)
  })

  it('reclaims an expired processing lease but leaves a fresh lease alone', async () => {
    const databasePath = createMigratedDatabase()
    const stale = insertRecordingAndJob(databasePath, {
      recordingStatus: 'transcribing',
      jobStatus: 'processing',
      createdAt: '2026-08-29T18:00:00.000Z',
      updatedAt: '2026-08-29T19:00:00.000Z',
    })
    insertRecordingAndJob(databasePath, {
      recordingStatus: 'transcribing',
      jobStatus: 'processing',
      createdAt: '2026-08-29T18:30:00.000Z',
      updatedAt: '2026-08-29T19:55:00.000Z',
    })
    const store = createStore(databasePath)

    const reclaimed = await store.claimNextJob(abortSignal)
    const noSecondClaim = await store.claimNextJob(abortSignal)
    await store.close()

    assert.equal(reclaimed?.id, stale.jobId)
    assert.equal(reclaimed?.updatedAt?.toISOString(), fixedNow.toISOString())
    assert.equal(noSecondClaim, null)
  })

  it('rolls back completion when the paired recording transition is invalid', async () => {
    const databasePath = createMigratedDatabase()
    const ids = insertRecordingAndJob(databasePath)
    const store = createStore(databasePath)
    const job = await store.claimNextJob(abortSignal)
    assert.ok(job)

    updateRecordingStatus(databasePath, ids.recordingId, 'transcribed')

    await assert.rejects(
      store.completeJob(job, 'Must not be saved.', abortSignal),
      StoreStateConflictError,
    )
    await store.close()

    assert.equal(readStatus(databasePath, 'transcription_jobs', ids.jobId), 'processing')
    assert.equal(readTranscript(databasePath, ids.recordingId), null)
  })
  it('rejects completion and failure by a worker whose lease has been reclaimed', async () => {
    const path = createMigratedDatabase()
    insertRecordingAndJob(path)
    let now = fixedNow
    const first = new SqliteStore(path, { processingLeaseMs, now: () => now })
    const second = new SqliteStore(path, { processingLeaseMs, now: () => now })
    try {
      const stale = await first.claimNextJob(abortSignal)
      assert.ok(stale)
      now = new Date(now.getTime() + processingLeaseMs + 1)
      const fresh = await second.claimNextJob(abortSignal)
      assert.ok(fresh)
      assert.notEqual(fresh.claimToken, stale.claimToken)
      await assert.rejects(first.completeJob(stale, 'stale', abortSignal), StoreStateConflictError)
      await assert.rejects(first.failJob(stale, 'stale error', abortSignal, true), StoreStateConflictError)
      await second.completeJob(fresh, 'fresh', abortSignal)
      assert.equal(readTranscript(path, fresh.recordingId), 'fresh')
    } finally { await first.close(); await second.close() }
  })

  it('backs off transient failures and stops after three attempts', async () => {
    const path = createMigratedDatabase()
    const ids = insertRecordingAndJob(path)
    let now = fixedNow
    const store = new SqliteStore(path, { processingLeaseMs, retryDelayMs: 100, now: () => now })
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const job = await store.claimNextJob(abortSignal)
        assert.ok(job)
        assert.equal(job.attemptCount, attempt)
        await store.failJob(job, 'temporary', abortSignal, true)
        assert.equal(await store.claimNextJob(abortSignal), null)
        now = new Date(now.getTime() + 1000)
      }
      assert.equal(await store.claimNextJob(abortSignal), null)
      assert.equal(readStatus(path, 'recordings', ids.recordingId), 'failed')
    } finally { await store.close() }
  })

  it('terminates an expired final attempt after repeated worker interruptions', async () => {
    const path = createMigratedDatabase()
    const ids = insertRecordingAndJob(path)
    let now = fixedNow
    const store = new SqliteStore(path, { processingLeaseMs, now: () => now })
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        assert.ok(await store.claimNextJob(abortSignal))
        now = new Date(now.getTime() + processingLeaseMs + 1)
      }
      assert.equal(await store.claimNextJob(abortSignal), null)
      assert.equal(readStatus(path, 'recordings', ids.recordingId), 'failed')
    } finally { await store.close() }
  })

  it('persists refinement output and fences stale claims on the migrated schema', () => {
    const path = createMigratedDatabase()
    const ids = insertRecordingAndJob(path)
    const db = new DatabaseSync(path)
    const id = randomUUID()
    db.prepare(`INSERT INTO refinement_jobs (id, recording_id, request_key, format, transcript_revision,
      source_text, status, attempt_count, created_at) VALUES (?, ?, ?, 'notes', 1, 'reviewed', 'created', 0, ?)`)
      .run(id, ids.recordingId, randomUUID(), fixedNow.toISOString())
    let now = fixedNow
    const store = new RefinementStore(path, processingLeaseMs, () => now)
    try {
      const stale = store.claim()
      assert.ok(stale)
      now = new Date(now.getTime() + processingLeaseMs + 1)
      const fresh = store.claim()
      assert.ok(fresh)
      const result = { content: '# Notes', model: 'test', provider: 'test', promptVersion: '1' }
      assert.equal(store.complete(stale, result), false)
      assert.equal(store.fail(stale, 'stale'), false)
      assert.equal(store.complete(fresh, result), true)
      assert.equal(db.prepare('SELECT content FROM refinement_jobs WHERE id = ?').get(id)?.content, '# Notes')
    } finally { store.close(); db.close() }
  })

})

interface SeedOptions {
  recordingStatus?: 'pending' | 'transcribing'
  jobStatus?: 'created' | 'processing'
  createdAt?: string
  updatedAt?: string | null
  retryCount?: number
}

function createMigratedDatabase(): string {
  const databasePath = join(temporaryRoot, `${randomUUID()}.db`)
  copyFileSync(templateDatabasePath, databasePath)
  return databasePath
}

function createStore(databasePath: string): SqliteStore {
  return new SqliteStore(databasePath, {
    processingLeaseMs,
    now: () => fixedNow,
  })
}

function insertRecordingAndJob(
  databasePath: string,
  options: SeedOptions = {},
): { recordingId: string; jobId: string } {
  const recordingId = randomUUID()
  const jobId = randomUUID()
  const createdAt = options.createdAt ?? '2026-08-29T19:00:00.000Z'
  const updatedAt = options.updatedAt ?? null
  const database = new DatabaseSync(databasePath)

  database.prepare(`
    INSERT INTO recordings (
      id, title, status, file_name, file_size_bytes, content_type, storage_key,
      created_at, updated_at, transcribed_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recordingId,
    'Test recording',
    options.recordingStatus ?? 'pending',
    'audio.webm',
    1_024,
    'audio/webm',
    `audio-recordings/${recordingId}/audio.webm`,
    createdAt,
    updatedAt,
    null,
  )
  database.prepare(`
    INSERT INTO transcription_jobs (
      id, recording_id, status, created_at, updated_at, retry_count, failure_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    jobId,
    recordingId,
    options.jobStatus ?? 'created',
    createdAt,
    updatedAt,
    options.retryCount ?? 0,
    null,
  )
  database.close()

  return { recordingId, jobId }
}

function readStatus(databasePath: string, table: 'recordings' | 'transcription_jobs', id: string): string {
  const database = new DatabaseSync(databasePath)
  const row = database.prepare(`SELECT status FROM ${table} WHERE id = ?`).get(id)
  database.close()
  assert.ok(row)
  return row.status as string
}

function readTranscript(databasePath: string, recordingId: string): string | null {
  const database = new DatabaseSync(databasePath)
  const row = database.prepare('SELECT transcribed_text FROM recordings WHERE id = ?').get(recordingId)
  database.close()
  assert.ok(row)
  return row.transcribed_text as string | null
}

function updateRecordingStatus(databasePath: string, recordingId: string, status: string): void {
  const database = new DatabaseSync(databasePath)
  database.prepare('UPDATE recordings SET status = ? WHERE id = ?').run(status, recordingId)
  database.close()
}
