import { Outlet } from '@tanstack/react-router'
import BottomNav from './BottomNav'

export default function Layout() {
  return (
    <div className="flex flex-col h-dvh bg-bg font-body text-text-primary overflow-hidden">
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto h-full pb-24">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
