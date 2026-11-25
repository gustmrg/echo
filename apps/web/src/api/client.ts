const API_BASE = '/api'

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      ...init,
    })
  } catch {
    throw new Error('Could not reach the server. Check that the API is running.')
  }

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) {
      unauthorizedHandler?.()
    }

    const body = await res.text().catch(() => '')
    let message = body.trim()
    try {
      const problem = JSON.parse(body)
      message = typeof problem === 'string' ? problem : problem.detail ?? problem.title ?? message
    } catch { /* Plain-text error response. */ }
    throw new ApiError(message || `Request failed (${res.status})`, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
