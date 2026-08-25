export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function formatContentType(contentType: string | null | undefined): string {
  if (!contentType) return '—'
  const subtype = contentType.split('/')[1] ?? contentType
  return subtype.toUpperCase().split(';')[0].trim()
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = (totalSeconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
