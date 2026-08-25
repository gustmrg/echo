import { useEffect, useRef, useState } from 'react'
import { getEditedTranscript, saveEditedTranscript, clearEditedTranscript } from '../lib/storage'
import { IconRedo, IconUndo } from './ui'

interface TranscriptEditorProps {
  recordingId: string
  original: string
  onChange?: (text: string) => void
}

const HISTORY_LIMIT = 100
const COALESCE_MS = 600

export default function TranscriptEditor({ recordingId, original, onChange }: TranscriptEditorProps) {
  const [text, setText] = useState(() => getEditedTranscript(recordingId) ?? original)
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

  // Debounced auto-save of edits (no API endpoint exists for this yet)
  useEffect(() => {
    const t = setTimeout(() => {
      if (text !== original) saveEditedTranscript(recordingId, text)
    }, 500)
    return () => clearTimeout(t)
  }, [text, original, recordingId])

  useEffect(() => {
    onChange?.(text)
  }, [text, onChange])

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
    clearEditedTranscript(recordingId)
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
        ref={areaRef}
        value={text}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={handleKeyDown}
        spellCheck
        className="w-full min-h-[280px] resize-none bg-surface border border-border rounded-md p-4 text-[15px] leading-[1.75] text-text-primary outline-none focus:border-text-tertiary transition-colors overflow-hidden"
      />

      {/* Footer stats */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-text-tertiary tabular-nums">
        <span>{words.toLocaleString()} words</span>
        <span aria-hidden>·</span>
        <span>{text.length.toLocaleString()} characters</span>
        {isEdited && (
          <>
            <span aria-hidden>·</span>
            <span className="text-warning">edited · saved locally</span>
          </>
        )}
      </div>
    </div>
  )
}
