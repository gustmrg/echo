const API_BASE = '/api'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error('Could not reach the server. Check that the API is running.')
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = body.trim()
    try {
      const problem = JSON.parse(body)
      message = typeof problem === 'string' ? problem : problem.detail ?? problem.title ?? message
    } catch { /* Plain-text error response. */ }
    throw new Error(message || `Request failed (${res.status})`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
