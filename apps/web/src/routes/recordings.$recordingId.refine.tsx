import { useRef, useState } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { getRecording } from '../api/recordings'
import { FORMATS, FORMAT_LABELS } from '../lib/formats'
import type { OutputFormat } from '../lib/formats'
import WorkflowSteps from '../components/WorkflowSteps'
import FormatCard from '../components/FormatCard'
import OutputRenderer from '../components/OutputRenderer'
import {
  Button,
  IconCheck,
  IconCopy,
  IconDownload,
  IconSparkle,
  Spinner,
} from '../components/ui'
import { createRefinement, getRefinements } from '../api/refinements'

export default function RefinePage() {
  const { recordingId } = useParams({ from: '/recordings/$recordingId/refine' })
  const navigate = useNavigate()
  const { format: requestedFormat } = useSearch({
    from: '/recordings/$recordingId/refine',
  })

  const {
    data: recording,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['recordings', recordingId],
    queryFn: () => getRecording(recordingId),
  })

  const [format, setFormat] = useState<OutputFormat | null>(
    requestedFormat ?? null,
  )
  const [requestError, setRequestError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const request = useRef<{
    key: string
    format: OutputFormat
    revision: number
    regenerate: boolean
  } | null>(null)
  const sending = useRef(false)
  const jobs = useQuery({
    queryKey: ['refinements', recordingId],
    queryFn: () => getRefinements(recordingId),
    refetchInterval: (query) =>
      query.state.data?.some(
        (j) => j.status === 'created' || j.status === 'processing',
      )
        ? 1000
        : false,
  })
  const currentJobs =
    jobs.data?.filter(
      (j) => j.transcriptRevision === recording?.transcriptRevision,
    ) ?? []
  const selected = currentJobs.find((j) => j.format === format)
  const output = selected?.status === 'completed' ? selected.content : null
  const error = requestError ?? jobs.error?.message ?? selected?.failureReason
  const phase = !format
    ? 'pick'
    : submitting
      ? 'processing'
      : requestError || jobs.isError || selected?.status === 'failed'
        ? 'error'
        : output
          ? 'done'
          : selected
            ? 'processing'
            : 'pick'
  const transcript = recording?.editedText ?? recording?.transcribedText ?? ''

  async function runRefine(fmt: OutputFormat, regenerate = false) {
    if (!recording || sending.current) return
    setFormat(fmt)
    setRequestError(null)
    setCopied(false)
    const cached = currentJobs.find(
      (j) => j.format === fmt && j.status !== 'failed',
    )
    if (!regenerate && cached) return
    if (
      !request.current ||
      request.current.format !== fmt ||
      request.current.revision !== recording.transcriptRevision ||
      request.current.regenerate !== regenerate
    )
      request.current = {
        key: crypto.randomUUID(),
        format: fmt,
        revision: recording.transcriptRevision,
        regenerate,
      }
    sending.current = true
    setSubmitting(true)
    try {
      await createRefinement(
        recordingId,
        fmt,
        recording.transcriptRevision,
        request.current.key,
        regenerate,
      )
      request.current = null
      await jobs.refetch()
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'Could not queue refinement.',
      )
    } finally {
      sending.current = false
      setSubmitting(false)
    }
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
    const base = (
      recording?.title ??
      recording?.fileName ??
      'echo-output'
    ).replace(/\.[^.]+$/, '')
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
    <div className="studio-page">
      <header className="document-heading">
        <div>
          <p className="eyebrow">Refine & export</p>
          <h1>
            {recording?.title ?? recording?.fileName ?? 'Your words, refined.'}
          </h1>
          <p className="document-meta">One thought. A few new possibilities.</p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            navigate({
              to: '/recordings/$recordingId',
              params: { recordingId },
            })
          }
        >
          Back to transcript
        </Button>
      </header>
      <WorkflowSteps stage="refine" />
      {isLoading && (
        <div className="document-message" role="status">
          <Spinner />
          Loading recording…
        </div>
      )}
      {isError && (
        <div className="document-message">
          <p>Failed to load recording.</p>
          <Button onClick={() => refetch()}>Try again</Button>
        </div>
      )}
      {recording && !ready && (
        <div className="document-message">
          This recording has no transcript yet. Wait for transcription to finish
          before refining.
        </div>
      )}
      {ready && (
        <div className="document-grid">
          <section className="document-paper">
            <div className="paper-heading">
              <span className="eyebrow">
                {format ? FORMAT_LABELS[format] : 'The reviewed transcript'}
              </span>
              <span>
                {phase === 'done'
                  ? 'Saved output'
                  : 'A little clarity goes a long way.'}
              </span>
            </div>
            {jobs.isError && !format && (
              <p role="alert" className="error-message">
                {jobs.error.message}
                <Button variant="ghost" onClick={() => jobs.refetch()}>
                  Retry loading outputs
                </Button>
              </p>
            )}
            {phase === 'pick' && (
              <div className="source-preview">{transcript}</div>
            )}
            {phase === 'processing' && (
              <div className="document-message">
                <IconSparkle className="animate-pulse-dot" />
                <p role="status">
                  {submitting
                    ? 'Queuing refinement…'
                    : selected?.status === 'created'
                      ? 'Waiting to refine…'
                      : 'Refining your transcript…'}
                </p>
                <Spinner />
                <p>You can come back when it’s ready.</p>
              </div>
            )}
            {phase === 'error' && format && (
              <div className="document-message">
                <p role="alert">{error ?? 'Refinement failed.'}</p>
                <Button onClick={() => void runRefine(format, true)}>
                  Retry
                </Button>
              </div>
            )}
            {phase === 'done' && format && output && (
              <>
                <div className="document-output">
                  <OutputRenderer content={output} />
                </div>
                <div className="editor-stats">
                  {output.trim().split(/\s+/).length.toLocaleString()} words ·
                  Saved with this transcript
                </div>
                <div className="output-actions">
                  <Button onClick={() => void copyOutput()}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="secondary" onClick={downloadOutput}>
                    <IconDownload size={16} />
                    Download .md
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void runRefine(format, true)}
                  >
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </section>
          <aside className="refinement-rail">
            <span className="eyebrow">Make something of it</span>
            <h2>Give it a shape.</h2>
            <p>
              Choose a format to create an output, or open one you’ve already
              made.
            </p>
            <div className="format-grid">
              {FORMATS.map((f) => (
                <FormatCard
                  key={f.id}
                  format={f}
                  selected={format === f.id}
                  disabled={submitting || jobs.isLoading}
                  cached={currentJobs.some(
                    (j) => j.format === f.id && j.status === 'completed',
                  )}
                  onSelect={() => void runRefine(f.id)}
                />
              ))}
            </div>
            <p>
              Outputs are saved with the reviewed transcript. AI can make
              mistakes; give the result a read.
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}
