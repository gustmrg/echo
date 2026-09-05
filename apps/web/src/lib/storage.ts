interface Draft { text: string; revision: number }
const draftKey = (id: string) => `echo:draft:v2:${id}`

export function readDraft(id: string, revision: number): string | null {
  try {
    const draft: Draft = JSON.parse(localStorage.getItem(draftKey(id)) ?? 'null')
    return draft?.revision === revision && typeof draft.text === 'string' ? draft.text : null
  } catch { return null }
}
export function writeDraft(id: string, text: string, revision: number) {
  try { localStorage.setItem(draftKey(id), JSON.stringify({ text, revision })) }
  catch { /* The server remains the durable store; navigation awaits saving. */ }
}
export function clearDraft(id: string) {
  try { localStorage.removeItem(draftKey(id)) } catch { /* Storage unavailable. */ }
}
export function clearRecordingStorage(id: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key === draftKey(id) || key === `echo:transcript:${id}` || key.startsWith(`echo:output:${id}:`))
        localStorage.removeItem(key)
    }
  } catch { /* Storage unavailable. */ }
}
