import type { OutputFormat } from '../mocks/refine'

/**
 * Client-side persistence for pipeline stages the API doesn't support yet
 * (transcript edits, refined outputs). When the API grows endpoints for
 * these, replace these helpers with real mutations.
 */

const transcriptKey = (recordingId: string) => `echo:transcript:${recordingId}`
const outputKey = (recordingId: string, format: OutputFormat) => `echo:output:${recordingId}:${format}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // storage full or unavailable — editing still works in memory
  }
}

export function getEditedTranscript(recordingId: string): string | null {
  return read(transcriptKey(recordingId))
}

export function saveEditedTranscript(recordingId: string, text: string) {
  write(transcriptKey(recordingId), text)
}

export function clearEditedTranscript(recordingId: string) {
  try {
    localStorage.removeItem(transcriptKey(recordingId))
  } catch {
    // ignore
  }
}

export function getSavedOutput(recordingId: string, format: OutputFormat): string | null {
  return read(outputKey(recordingId, format))
}

export function saveOutput(recordingId: string, format: OutputFormat, content: string) {
  write(outputKey(recordingId, format), content)
}
