import { apiFetch } from './client'

export interface AuthStatus {
  authEnabled: boolean
  authenticated: boolean
  username: string | null
}

export interface LoginResponse {
  authenticated: boolean
  username: string
}

export const authStatusQuery = {
  queryKey: ['auth', 'status'] as const,
  queryFn: getAuthStatus,
  staleTime: 60_000,
  retry: false,
}

export function getAuthStatus(): Promise<AuthStatus> {
  return apiFetch<AuthStatus>('/auth/status')
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function logout(): Promise<void> {
  return apiFetch<void>('/auth/logout', { method: 'POST' })
}
