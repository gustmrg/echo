import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Layout from '../src/components/Layout'
import LoginScreen from '../src/components/LoginScreen'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })
}

function renderLayoutApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rootRoute = createRootRoute({ component: Layout })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Workspace home content</div>,
  })
  const recordRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/record',
    component: () => <div>Record page</div>,
  })
  const outputsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/outputs',
    component: () => <div>Outputs page</div>,
  })
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: () => <div>Settings page</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, recordRoute, outputsRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('LoginScreen', () => {
  it('submits credentials and reports authenticated status on success', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({ authenticated: true, username: 'owner' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const onSuccess = vi.fn()
    render(<LoginScreen onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({
        authEnabled: true,
        authenticated: true,
        username: 'owner',
      })
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ username: 'owner', password: 'secret-pass' }),
      }),
    )
  })

  it('displays an error message when login fails with 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 401 })))

    const onSuccess = vi.fn()
    render(<LoginScreen onSuccess={onSuccess} />)

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-pass' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid username or password.')
    expect(onSuccess).not.toHaveBeenCalled()
  })
})

describe('Layout auth gate', () => {
  it('bypasses LoginScreen when authEnabled is false', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/auth/status') {
        return Promise.resolve(
          jsonResponse({ authEnabled: false, authenticated: false, username: null }),
        )
      }
      if (url === '/api/recordings') {
        return Promise.resolve(jsonResponse([]))
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLayoutApp()

    expect(await screen.findByText('Workspace home content')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Sign in to Echo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('gates access when authEnabled is true and supports sign-in and sign-out', async () => {
    let authenticated = false

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/auth/status') {
        return Promise.resolve(
          jsonResponse({
            authEnabled: true,
            authenticated,
            username: authenticated ? 'owner' : null,
          }),
        )
      }
      if (url === '/api/auth/login' && init?.method === 'POST') {
        authenticated = true
        return Promise.resolve(jsonResponse({ authenticated: true, username: 'owner' }))
      }
      if (url === '/api/auth/logout' && init?.method === 'POST') {
        authenticated = false
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url === '/api/recordings') {
        return Promise.resolve(
          authenticated ? jsonResponse([]) : new Response(null, { status: 401 }),
        )
      }
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLayoutApp()

    expect(await screen.findByRole('heading', { name: 'Sign in to Echo' })).toBeTruthy()
    expect(screen.queryByText('Workspace home content')).toBeNull()

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Workspace home content')).toBeTruthy()

    const signOutButtons = screen.getAllByRole('button', { name: 'Sign out' })
    fireEvent.click(signOutButtons[0])

    expect(await screen.findByRole('heading', { name: 'Sign in to Echo' })).toBeTruthy()
  })
})
