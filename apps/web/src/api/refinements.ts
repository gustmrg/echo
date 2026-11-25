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

export interface OutputSummary {
  id: string
  recordingId: string
  recordingTitle: string | null
  recordingFileName: string
  format: OutputFormat
  transcriptRevision: number
  wordCount: number
  model: string | null
  provider: string | null
  createdAt: string
}

export interface OutputsPageResponse {
  items: OutputSummary[]
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
  hasActiveJobs: boolean
}

export interface GetOutputsParams {
  page?: number
  pageSize?: number
  format?: OutputFormat
}

export function getOutputs(
  params?: GetOutputsParams,
): Promise<OutputsPageResponse> {
  const search = new URLSearchParams()
  if (params?.page !== undefined) search.set('page', String(params.page))
  if (params?.pageSize !== undefined)
    search.set('pageSize', String(params.pageSize))
  if (params?.format) search.set('format', params.format)
  const qs = search.toString()
  return apiFetch<OutputsPageResponse>(qs ? `/outputs?${qs}` : '/outputs')
}

export function getRefinements(id: string): Promise<Refinement[]> {
  return apiFetch(`/recordings/${id}/refinements`)
}

export function createRefinement(
  id: string,
  format: OutputFormat,
  expectedRevision: number,
  requestKey: string,
  regenerate = false,
): Promise<Refinement> {
  return apiFetch(`/recordings/${id}/refinements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, expectedRevision, requestKey, regenerate }),
  })
}
