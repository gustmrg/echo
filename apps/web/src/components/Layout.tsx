import { Link, Outlet } from '@tanstack/react-router'
import BottomNav from './BottomNav'
import { IconHome, IconMic, IconSettings } from './ui'

const linkBase =
  'flex items-center justify-center w-11 h-11 rounded-xl transition-colors'

export default function Layout() {
  return (
    <div className="flex h-dvh bg-bg font-body text-text-primary overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col items-center w-[72px] flex-shrink-0 border-r border-border/60 py-5 gap-2">
        <Link
          to="/"
          className="font-display text-[26px] leading-none text-accent mb-6 select-none"
          aria-label="Echo home"
        >
          E
        </Link>

        <Link
          to="/"
          aria-label="Home"
          title="Home"
          className={linkBase}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkBase} bg-surface-raised text-text-primary` }}
          inactiveProps={{ className: `${linkBase} text-text-tertiary hover:text-text-secondary hover:bg-surface` }}
        >
          <IconHome />
        </Link>

        <Link
          to="/record"
          aria-label="New recording"
          title="New recording"
          className="flex items-center justify-center w-11 h-11 rounded-full bg-accent text-white shadow-[0_4px_20px_rgba(232,87,58,0.35)] hover:bg-[#f0653f] hover:scale-105 transition-all my-1"
        >
          <IconMic size={20} />
        </Link>

        <div className="flex-1" />

        <Link
          to="/settings"
          aria-label="Settings"
          title="Settings"
          className={linkBase}
          activeOptions={{ exact: true }}
          activeProps={{ className: `${linkBase} bg-surface-raised text-text-primary` }}
          inactiveProps={{ className: `${linkBase} text-text-tertiary hover:text-text-secondary hover:bg-surface` }}
        >
          <IconSettings />
        </Link>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto h-full pb-24 md:pb-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}
