const API_BASE = '/api'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error('Could not reach the server. Check that the API is running.')
  }

  if (!res.ok) {
    // The API returns plain-text error messages (e.g. "File exceeds 25MB limit.")
    const body = await res.text().catch(() => '')
    throw new Error(body.trim() || `Request failed (${res.status})`)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
