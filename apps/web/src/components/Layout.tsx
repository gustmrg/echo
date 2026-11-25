import { useEffect, useState } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authStatusQuery, logout, type AuthStatus } from '../api/auth'
import { setUnauthorizedHandler } from '../api/client'
import { recordingsQuery, newestFirst } from '../lib/recording-query'
import Brand from './Brand'
import LoginScreen from './LoginScreen'
import { IconMic, IconHome, IconCopy, IconSettings, Spinner } from './ui'

interface WorkspaceShellProps {
  auth: AuthStatus
  signingOut: boolean
  onSignOut: () => void
}

function WorkspaceShell({ auth, signingOut, onSignOut }: WorkspaceShellProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { data } = useQuery(recordingsQuery)
  const recent = newestFirst(data).slice(0, 3)
  const current = data?.find((recording) => pathname.includes(recording.id))
  const breadcrumb = current
    ? (current.title ?? current.fileName)
    : pathname === '/record'
      ? 'New recording'
      : pathname === '/outputs'
        ? 'Saved outputs'
        : pathname === '/settings'
          ? 'About Echo'
          : 'Recordings'
  const showSignOut = auth.authEnabled && auth.authenticated

  return (
    <div className="echo-app">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="workspace-sidebar">
        <Link to="/" aria-label="Echo home">
          <Brand />
        </Link>
        <Link to="/record" className="echo-button primary">
          <IconMic size={16} />
          New recording
        </Link>
        <nav className="workspace-nav" aria-label="Workspace">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: 'active' }}
          >
            <IconHome size={17} />
            Recordings{data && <span className="nav-count">{data.length}</span>}
          </Link>
          <Link to="/outputs" activeProps={{ className: 'active' }}>
            <IconCopy size={17} />
            Saved outputs
          </Link>
          <Link to="/settings" activeProps={{ className: 'active' }}>
            <IconSettings size={17} />
            About Echo
          </Link>
        </nav>
        {recent.length > 0 && (
          <div className="recent-recordings">
            <p className="eyebrow">Recent recordings</p>
            {recent.map((r) => (
              <Link
                key={r.id}
                to="/recordings/$recordingId"
                params={{ recordingId: r.id }}
              >
                {r.title ?? r.fileName}
              </Link>
            ))}
          </div>
        )}
        <div className="workspace-signature-footer">
          <div className="workspace-signature">
            <span className="workspace-avatar" aria-hidden="true">
              {showSignOut && auth.username ? auth.username[0]?.toLowerCase() : 'e'}
            </span>
            <div>
              {showSignOut && auth.username ? auth.username : 'Your workspace'}
              <small>{showSignOut ? 'Signed in' : 'A place for your thoughts'}</small>
            </div>
          </div>
          {showSignOut && (
            <button
              type="button"
              className="echo-button ghost sign-out-button"
              onClick={onSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <Link className="mobile-logo" to="/" aria-label="Echo home">
            <Brand />
          </Link>
          <div className="workspace-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden="true">›</span>
            <span>{breadcrumb}</span>
          </div>
          <span className="workspace-tagline">Capture · Review · Refine</span>
          {showSignOut && (
            <button
              type="button"
              className="echo-button ghost mobile-sign-out"
              onClick={onSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </header>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: 'active' }}
          >
            Recordings
          </Link>
          <Link to="/record" activeProps={{ className: 'active' }}>
            New recording
          </Link>
          <Link to="/outputs" activeProps={{ className: 'active' }}>
            Outputs
          </Link>
          <Link to="/settings" activeProps={{ className: 'active' }}>
            About
          </Link>
        </nav>
        <main id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function Layout() {
  const queryClient = useQueryClient()
  const authQuery = useQuery(authStatusQuery)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.setQueryData<AuthStatus>(authStatusQuery.queryKey, {
        authEnabled: true,
        authenticated: false,
        username: null,
      })
      queryClient.removeQueries({ queryKey: ['recordings'] })
      void queryClient.invalidateQueries({ queryKey: authStatusQuery.queryKey })
    })
    return () => setUnauthorizedHandler(null)
  }, [queryClient])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await logout()
    } finally {
      queryClient.setQueryData<AuthStatus>(authStatusQuery.queryKey, {
        authEnabled: true,
        authenticated: false,
        username: null,
      })
      queryClient.removeQueries({ queryKey: ['recordings'] })
      await queryClient.invalidateQueries({ queryKey: authStatusQuery.queryKey })
      setSigningOut(false)
    }
  }

  if (authQuery.isPending) {
    return (
      <div className="auth-screen">
        <Spinner />
      </div>
    )
  }

  if (authQuery.isError) {
    return (
      <div className="auth-screen">
        <main className="studio-page auth-card">
          <Brand />
          <h1>Unable to reach Echo</h1>
          <p className="intro-copy">
            {authQuery.error instanceof Error
              ? authQuery.error.message
              : 'Could not check authentication status.'}
          </p>
          <button
            type="button"
            className="echo-button primary"
            onClick={() => void authQuery.refetch()}
          >
            Try again
          </button>
        </main>
      </div>
    )
  }

  if (authQuery.data.authEnabled && !authQuery.data.authenticated) {
    return (
      <LoginScreen
        onSuccess={(status) => {
          queryClient.setQueryData<AuthStatus>(authStatusQuery.queryKey, status)
          void queryClient.invalidateQueries({ queryKey: authStatusQuery.queryKey })
        }}
      />
    )
  }

  return (
    <WorkspaceShell
      auth={authQuery.data}
      signingOut={signingOut}
      onSignOut={() => void handleSignOut()}
    />
  )
}
