import {
  createRouter,
  createRoute,
  createRootRoute,
} from '@tanstack/react-router'
import { FORMATS, type OutputFormat } from './lib/formats'
import Layout from './components/Layout'
import HomePage from './routes/index'
import RecordPage from './routes/record'
import ReviewPage from './routes/recordings.$recordingId'
import RefinePage from './routes/recordings.$recordingId.refine'
import OutputsPage from './routes/outputs'
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

const refineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recordings/$recordingId/refine',
  component: RefinePage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { format?: OutputFormat } => ({
    format: FORMATS.some((f) => f.id === search.format)
      ? (search.format as OutputFormat)
      : undefined,
  }),
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const outputsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/outputs',
  component: OutputsPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  recordRoute,
  reviewRoute,
  refineRoute,
  settingsRoute,
  outputsRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
