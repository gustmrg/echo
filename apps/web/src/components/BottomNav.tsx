import { Link } from '@tanstack/react-router'
import { IconHome, IconMic, IconSettings } from './ui'

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] z-50 md:hidden">
      <div className="max-w-md mx-auto">
        <div className="flex items-end justify-around px-6 pt-3 pb-4 bg-gradient-to-t from-bg via-bg/95 to-transparent border-t border-border">
          <Link
            to="/"
            className="flex flex-col items-center gap-1 transition-colors"
            activeProps={{ className: 'text-text-primary' }}
            inactiveProps={{ className: 'text-text-tertiary' }}
            activeOptions={{ exact: true }}
          >
            <IconHome />
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          <Link
            to="/record"
            aria-label="New recording"
            className="relative flex items-center justify-center w-16 h-16 -mt-6 rounded-full bg-accent text-white shadow-[0_4px_32px_rgba(232,87,58,0.4)] active:scale-95 transition-transform"
          >
            <IconMic />
          </Link>

          <Link
            to="/settings"
            className="flex flex-col items-center gap-1 transition-colors"
            activeProps={{ className: 'text-text-primary' }}
            inactiveProps={{ className: 'text-text-tertiary' }}
            activeOptions={{ exact: true }}
          >
            <IconSettings />
            <span className="text-[10px] font-medium">Settings</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
