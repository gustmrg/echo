import { useEffect, useRef, useState } from 'react'
import { readDraft, writeDraft, clearDraft } from '../lib/storage'
import { saveTranscript } from '../api/recordings'
import { TranscriptSession } from '../lib/transcript-session'
import { useBlocker } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { IconRedo, IconUndo } from './ui'

interface TranscriptEditorProps {
  recordingId: string
  original: string
  editedText: string | null
  revision: number
}

const HISTORY_LIMIT = 100
const COALESCE_MS = 600

export default function TranscriptEditor({ recordingId, original, editedText, revision }: TranscriptEditorProps) {
  const queryClient = useQueryClient()
  const [session] = useState(() => new TranscriptSession(editedText ?? original, revision, async (value, expected) => {
    const recording = await saveTranscript(recordingId, value, expected)
    queryClient.setQueryData(['recordings', recordingId], recording)
    void queryClient.invalidateQueries({ queryKey: ['outputs'] })
    return recording.transcriptRevision
  }, readDraft(recordingId, revision)))
  const [text, updateText] = useState(session.text)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  function setText(value: string) {
    session.edit(value)
    writeDraft(recordingId, value, session.revision)
    updateText(value)
  }
  async function flush() {
    setSaving(true)
    try {
      await session.flush()
      clearDraft(recordingId)
      setSaveError(null)
    } catch (error) {
      writeDraft(recordingId, session.text, session.revision)
      setSaveError(error instanceof Error ? error.message : 'Could not save transcript.')
      throw error
    } finally { setSaving(false) }
  }
  useBlocker({
    shouldBlockFn: async () => {
      try { await flush(); return false } catch { return true }
    },
    enableBeforeUnload: () => session.dirty,
  })
  const [past, setPast] = useState<string[]>([])
  const [future, setFuture] = useState<string[]>([])
  const lastPush = useRef(0)
  const areaRef = useRef<HTMLTextAreaElement | null>(null)

  const isEdited = text !== original
  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  // Auto-grow the textarea to fit its content
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => {
    const timer = setTimeout(() => { void flush().catch(() => {}) }, 500)
    return () => clearTimeout(timer)
    // The session is stable; text changes schedule saving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  function commit(next: string) {
    const now = Date.now()
    if (now - lastPush.current > COALESCE_MS) {
      setPast((p) => [...p.slice(-(HISTORY_LIMIT - 1)), text])
    }
    lastPush.current = now
    setFuture([])
    setText(next)
  }

  function undo() {
    const prev = past[past.length - 1]
    if (prev === undefined) return
    setPast(past.slice(0, -1))
    setFuture((f) => [...f, text])
    setText(prev)
  }

  function redo() {
    const next = future[future.length - 1]
    if (next === undefined) return
    setFuture(future.slice(0, -1))
    setPast((p) => [...p, text])
    setText(next)
  }

  function reset() {
    setPast([])
    setFuture([])
    setText(original)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
    }
  }

  const toolBtn =
    'p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-tertiary'

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2">
        <button onClick={undo} disabled={past.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)" className={toolBtn}>
          <IconUndo />
        </button>
        <button onClick={redo} disabled={future.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className={toolBtn}>
          <IconRedo />
        </button>
        <div className="flex-1" />
        {isEdited && (
          <button
            onClick={reset}
            className="text-xs font-medium text-text-tertiary hover:text-accent transition-colors"
          >
            Reset to original
          </button>
        )}
      </div>

      {/* Editor */}
      <textarea
        aria-label="Transcript"
        maxLength={200000}
        ref={areaRef}
        value={text}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck
        className="transcript-editor"
      />

      {saveError && <div role="alert" className="text-sm text-accent mt-2">
        {saveError} Your text is retained here.
        <button onClick={() => void flush().catch(() => {})} className="underline ml-2">Retry save</button>
      </div>}
      {/* Footer stats */}
      <div className="editor-stats">
        <span>{words.toLocaleString()} words</span>
        <span aria-hidden>·</span>
        <span>{text.length.toLocaleString()} characters</span>
        {isEdited && (
          <>
            <span aria-hidden>·</span>
            <span className="text-warning">{saving ? 'Saving…' : session.dirty ? 'Unsaved changes' : 'Saved'}</span>
          </>
        )}
      </div>
    </div>
  )
}
