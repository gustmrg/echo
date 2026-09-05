import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import type { OutputFormat, RefinementResult } from './refiner.js'

export interface RefinementJob {
  id: string; format: OutputFormat; sourceText: string; claimToken: string; attemptCount: number
}

export class RefinementStore {
  readonly #db: DatabaseSync
  constructor(path: string, private readonly leaseMs: number, private readonly now = () => new Date()) {
    this.#db = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 })
    this.#db.exec('PRAGMA journal_mode = WAL')
  }
  close() { this.#db.close() }

  claim(): RefinementJob | null {
    this.#db.exec('BEGIN IMMEDIATE')
    try {
      const now = this.now().toISOString()
      const cutoff = new Date(this.now().getTime() - this.leaseMs).toISOString()
      this.#db.prepare(`UPDATE refinement_jobs SET status = 'failed', claim_token = NULL,
        failure_reason = 'Processing was interrupted too many times. Generate again.', updated_at = ?
        WHERE status = 'processing' AND attempt_count >= 3 AND julianday(updated_at) <= julianday(?)`).run(now, cutoff)
      const token = randomUUID()
      const row = this.#db.prepare(`UPDATE refinement_jobs
        SET status = 'processing', claim_token = ?, attempt_count = attempt_count + 1,
            updated_at = ?, next_attempt_at = NULL, failure_reason = NULL
        WHERE id = (SELECT id FROM refinement_jobs WHERE
          (status = 'created' AND (next_attempt_at IS NULL OR julianday(next_attempt_at) <= julianday(?))) OR
          (status = 'processing' AND julianday(updated_at) <= julianday(?))
          ORDER BY created_at, id LIMIT 1)
        RETURNING id, format, source_text, attempt_count`).get(token, now, now, cutoff)
      this.#db.exec('COMMIT')
      if (!row) return null
      if (typeof row.id !== 'string' || typeof row.source_text !== 'string' || typeof row.attempt_count !== 'number' ||
          !['notes', 'blog', 'interview', 'news'].includes(String(row.format))) throw new Error('Invalid refinement job')
      return { id: row.id, sourceText: row.source_text, format: row.format as OutputFormat,
        claimToken: token, attemptCount: row.attempt_count }
    } catch (error) {
      if (this.#db.isTransaction) this.#db.exec('ROLLBACK')
      throw error
    }
  }

  complete(job: RefinementJob, result: RefinementResult): boolean {
    return this.#db.prepare(`UPDATE refinement_jobs SET status = 'completed', content = ?, model = ?,
      provider = ?, prompt_version = ?, claim_token = NULL, updated_at = ?
      WHERE id = ? AND status = 'processing' AND claim_token = ?`).run(result.content, result.model,
      result.provider, result.promptVersion, this.now().toISOString(), job.id, job.claimToken).changes === 1
  }

  fail(job: RefinementJob, reason: string): boolean {
    const retry = job.attemptCount < 3
    const next = new Date(this.now().getTime() + 5000 * 2 ** (job.attemptCount - 1)).toISOString()
    return this.#db.prepare(`UPDATE refinement_jobs SET status = ?, failure_reason = ?, claim_token = NULL,
      next_attempt_at = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND claim_token = ?`)
      .run(retry ? 'created' : 'failed', reason, retry ? next : null, this.now().toISOString(), job.id, job.claimToken).changes === 1
  }
}
