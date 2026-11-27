import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { recordingsQuery } from '../lib/recording-query'
import Brand from './Brand'
import { IconMic, IconHome, IconCopy, IconSettings } from './ui'

export default function Layout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { data } = useQuery(recordingsQuery)
  const items = data?.items ?? []
  const recent = items.slice(0, 3)
  const current = items.find((recording) => pathname.includes(recording.id))
  const breadcrumb = current
    ? (current.title ?? current.fileName)
    : pathname === '/record'
      ? 'New recording'
      : pathname === '/outputs'
        ? 'Saved outputs'
        : pathname === '/settings'
          ? 'About Echo'
          : 'Recordings'
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
            Recordings
            {data && <span className="nav-count">{data.totalCount}</span>}
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
        <div className="workspace-signature">
          <span className="workspace-avatar" aria-hidden="true">
            e
          </span>
          <div>
            Your workspace<small>A place for your thoughts</small>
          </div>
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
