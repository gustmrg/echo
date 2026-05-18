import { createRouter, createRoute, createRootRoute } from '@tanstack/react-router'
import Layout from './components/Layout'
import HomePage from './routes/index'
import RecordPage from './routes/record'
import ReviewPage from './routes/recordings.$recordingId'
import SettingsPage from './routes/settings'

const rootRoute = createRootRoute({
  component: Layout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const recordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/record',
  component: RecordPage,
})

const reviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recordings/$recordingId',
  component: ReviewPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, recordRoute, reviewRoute, settingsRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
