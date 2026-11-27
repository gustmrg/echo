import type { OutputFormat } from '../refinement/refiner.js'
export interface JobMessage {
  job_id: string; claim_token: string; kind: 'transcription' | 'refinement'
  correlation_id?: string
  file_key?: string; file_name?: string; content_type?: string
  source_text?: string; format?: OutputFormat
}
export interface JobResult {
  job_id: string; claim_token: string; kind: JobMessage['kind']; status: 'completed' | 'failed'
  correlation_id?: string
  transcription_text?: string; error?: string; retryable?: boolean
  content?: string; model?: string; provider?: string; prompt_version?: string
}
export function parseJob(bytes: Buffer): JobMessage {
  const value: unknown = JSON.parse(bytes.toString('utf8'))
  if (!value || typeof value !== 'object') throw new Error('Invalid job')
  const job = value as Record<string, unknown>
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (typeof job.job_id !== 'string' || !uuid.test(job.job_id) ||
      typeof job.claim_token !== 'string' || !uuid.test(job.claim_token)) throw new Error('Invalid job identity')
  if (job.correlation_id === null) {
    delete job.correlation_id
  } else if (job.correlation_id !== undefined) {
    if (typeof job.correlation_id !== 'string' || !job.correlation_id.trim() || job.correlation_id.length > 64) {
      throw new Error('Invalid correlation_id')
    }
  }
  if (job.kind === 'transcription') {
    if (typeof job.file_key !== 'string' || !job.file_key.trim() ||
        typeof job.file_name !== 'string' || !job.file_name.trim() ||
        (job.content_type != null && typeof job.content_type !== 'string')) throw new Error('Invalid audio job')
  } else if (job.kind === 'refinement') {
    if (typeof job.source_text !== 'string' || !job.source_text.trim() ||
        typeof job.format !== 'string' || !['notes', 'blog', 'interview', 'news'].includes(job.format)) throw new Error('Invalid refinement job')
  } else throw new Error('Unknown job kind')
  return job as unknown as JobMessage
}
