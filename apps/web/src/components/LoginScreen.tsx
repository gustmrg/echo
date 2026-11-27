import { useState, type FormEvent } from 'react'
import { login, type AuthStatus } from '../api/auth'
import { ApiError } from '../api/client'
import Brand from './Brand'

interface LoginScreenProps {
  onSuccess: (status: AuthStatus) => void
}

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const result = await login(username.trim(), password)
      onSuccess({
        authEnabled: true,
        authenticated: result.authenticated,
        username: result.username,
      })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid username or password.')
      } else if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Sign in failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-screen">
      <main className="studio-page auth-card">
        <Brand />
        <p className="eyebrow">Private workspace</p>
        <h1>Sign in to Echo</h1>
        <p className="intro-copy">
          Enter your credentials to access your recordings, transcripts, and saved outputs.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="auth-username">Username</label>
            <input
              id="auth-username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="echo-button primary"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
