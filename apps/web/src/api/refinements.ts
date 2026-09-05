import { apiFetch } from './client'
import type { OutputFormat } from '../lib/formats'

export interface Refinement {
  id: string
  format: OutputFormat
  transcriptRevision: number
  status: 'created' | 'processing' | 'completed' | 'failed'
  content: string | null
  failureReason: string | null
}
export function getRefinements(id: string): Promise<Refinement[]> {
  return apiFetch(`/recordings/${id}/refinements`)
}
export function createRefinement(id: string, format: OutputFormat, expectedRevision: number,
  requestKey: string, regenerate = false): Promise<Refinement> {
  return apiFetch(`/recordings/${id}/refinements`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, expectedRevision, requestKey, regenerate }),
  })
}
