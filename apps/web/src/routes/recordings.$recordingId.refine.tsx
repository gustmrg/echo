import { useRef, useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getRecording } from '../api/recordings'
import { FORMATS, FORMAT_LABELS } from '../lib/formats'
import type { OutputFormat } from '../lib/formats'
import FormatCard from '../components/FormatCard'
import OutputRenderer from '../components/OutputRenderer'
import { Button, IconCheck, IconCopy, IconDownload, IconSparkle, PageHeader, Spinner } from '../components/ui'
import { createRefinement, getRefinements } from '../api/refinements'


export default function RefinePage() {
  const { recordingId } = useParams({ from: '/recordings/$recordingId/refine' })
  const navigate = useNavigate()

  const { data: recording, isLoading, isError, refetch } = useQuery({
    queryKey: ['recordings', recordingId],
    queryFn: () => getRecording(recordingId),
  })

  const [format, setFormat] = useState<OutputFormat | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const request = useRef<{ key: string; format: OutputFormat; revision: number; regenerate: boolean } | null>(null)
  const sending = useRef(false)
  const jobs = useQuery({
    queryKey: ['refinements', recordingId],
    queryFn: () => getRefinements(recordingId),
    refetchInterval: (query) => query.state.data?.some(j => j.status === 'created' || j.status === 'processing') ? 1000 : false,
  })
  const currentJobs = jobs.data?.filter(j => j.transcriptRevision === recording?.transcriptRevision) ?? []
  const selected = currentJobs.find(j => j.format === format)
  const output = selected?.status === 'completed' ? selected.content : null
  const error = requestError ?? jobs.error?.message ?? selected?.failureReason
  const phase = !format ? 'pick' : submitting ? 'processing' : requestError || jobs.isError || selected?.status === 'failed' ? 'error' :
    output ? 'done' : selected ? 'processing' : 'pick'
  const transcript = recording?.editedText ?? recording?.transcribedText ?? ''

  async function runRefine(fmt: OutputFormat, regenerate = false) {
    if (!recording || sending.current) return
    setFormat(fmt)
    setRequestError(null)
    setCopied(false)
    const cached = currentJobs.find(j => j.format === fmt && j.status !== 'failed')
    if (!regenerate && cached) return
    if (!request.current || request.current.format !== fmt || request.current.revision !== recording.transcriptRevision || request.current.regenerate !== regenerate)
      request.current = { key: crypto.randomUUID(), format: fmt, revision: recording.transcriptRevision, regenerate }
    sending.current = true
    setSubmitting(true)
    try {
      await createRefinement(recordingId, fmt, recording.transcriptRevision, request.current.key, regenerate)
      request.current = null
      await jobs.refetch()
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not queue refinement.')
    } finally { sending.current = false; setSubmitting(false) }
  }

  async function copyOutput() {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function downloadOutput() {
    if (!output || !format) return
    const base = (recording?.title ?? recording?.fileName ?? 'echo-output').replace(/\.[^.]+$/, '')
    const blob = new Blob([output], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${base}-${format}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ready = recording?.status === 'transcribed' && transcript.length > 0

  return (
    <div className="flex flex-col h-full bg-bg animate-fade-in-up">
      <PageHeader
        title="Refine with AI"
        onBack={() => navigate({ to: '/recordings/$recordingId', params: { recordingId } })}
      />

      {isLoading && (
        <div className="flex-1 px-5 md:px-8 pt-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[76px] bg-surface rounded-md animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-text-secondary">Failed to load recording.</p>
          <Button variant="secondary" onClick={() => refetch()} className="px-4 py-2 text-sm">
            Try again
          </Button>
        </div>
      )}

      {recording && !ready && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <p className="text-sm text-text-secondary text-center max-w-[280px]">
            This recording has no transcript yet. Wait for transcription to finish before refining.
          </p>
          <Button
            variant="secondary"
            onClick={() => navigate({ to: '/recordings/$recordingId', params: { recordingId } })}
            className="px-4 py-2.5 text-sm"
          >
            Back to recording
          </Button>
        </div>
      )}

      {ready && (
        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6">
          {/* Format picker */}
          {phase === 'pick' && (
            <div className="animate-fade-in-up">
              <h2 className="font-display text-xl text-text-primary mb-1.5">Choose an output format</h2>
              <p className="text-sm text-text-tertiary mb-5">
                The same transcript, four different shapes. You can try them all.
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {FORMATS.map((f) => (
                  <FormatCard
                    key={f.id}
                    format={f}
                    cached={currentJobs.some(j => j.format === f.id && j.status === 'completed')}
                    onSelect={() => void runRefine(f.id)}
                  />
                ))}
              </div>
              <p className="text-[11px] text-text-tertiary mt-5">
                Your outputs are saved with the reviewed transcript.
              </p>
            </div>
          )}

          {/* Processing */}
          {phase === 'processing' && format && (
            <div className="flex flex-col items-center justify-center py-20 gap-6 animate-fade-in-up">
              <div className="w-12 h-12 rounded-full bg-accent-glow text-accent flex items-center justify-center">
                <IconSparkle size={22} className="animate-pulse-dot" />
              </div>
              <p role="status" className="text-sm text-text-primary">
                {submitting ? 'Queuing refinement…' : selected?.status === 'created' ? 'Waiting to refine…' : 'Refining your transcript…'}
              </p>
              <Spinner className="w-5 h-5" />
              <p className="text-xs text-text-tertiary">as {FORMAT_LABELS[format]}</p>
            </div>
          )}

          {/* Error */}
          {phase === 'error' && format && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in-up">
              <p className="text-sm text-text-secondary text-center max-w-[280px]">
                {error ?? 'Refinement failed.'}
              </p>
              <div className="flex gap-2.5">
                <Button variant="secondary" onClick={() => setFormat(null)} className="px-4 py-2.5 text-sm">
                  Choose format
                </Button>
                <Button onClick={() => void runRefine(format, true)} className="px-4 py-2.5 text-sm">
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Output */}
          {phase === 'done' && format && output && (
            <div className="animate-fade-in-up">
              <div className="flex items-center gap-2.5 mb-5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] px-2.5 py-1 rounded-full bg-accent-glow text-accent">
                  {FORMAT_LABELS[format]}
                </span>
                <span className="text-[11px] text-text-tertiary">
                  {output.trim().split(/\s+/).length.toLocaleString()} words
                </span>
              </div>

              <div className="bg-surface border border-border rounded-md p-5 md:p-6 mb-5">
                <OutputRenderer content={output} />
              </div>

              <div className="flex flex-wrap gap-2.5 pb-4">
                <Button onClick={() => void copyOutput()} className="flex-1 min-w-[140px] py-3 text-sm">
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <Button variant="secondary" onClick={downloadOutput} className="flex-1 min-w-[140px] py-3 text-sm">
                  <IconDownload size={16} />
                  Download .md
                </Button>
                <Button variant="secondary" onClick={() => void runRefine(format, true)} className="py-3 text-sm">
                  Regenerate
                </Button>
                <Button variant="ghost" onClick={() => setFormat(null)} className="py-3 text-sm">
                  Try another format
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
