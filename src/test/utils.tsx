import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '@/router'
import { AuthContext, AuthProvider, type AuthContextValue } from '@/auth/AuthContext'
import type { AuthResponse } from '@/api/types'

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

export const TEST_USER: AuthResponse = {
  token: 'test.jwt.token',
  expiresAtUtc: '2999-01-01T00:00:00Z',
  userId: '11111111-1111-1111-1111-111111111111',
  username: 'testuser',
}

/** Build a fake auth context value; authenticated by default. */
export function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: TEST_USER,
    status: 'authenticated',
    login: async () => {},
    register: async () => {},
    logout: () => {},
    updateUsername: () => {},
    ...overrides,
  }
}

/** A signed-out ("guest") auth context value (guest access, §4.8). */
export function guestAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return makeAuthValue({ user: null, status: 'unauthenticated', ...overrides })
}

/**
 * Render the real route tree as a signed-out guest — the browsable
 * `unauthenticated` state (guest access). MSW serves the anonymous reads.
 */
export function renderGuestRoute(path: string) {
  return renderRoute(path, { auth: guestAuthValue() })
}

/**
 * Render the real route tree with a FAKE auth context — for shell/router tests
 * that shouldn't exercise the network. Authenticated by default.
 */
export function renderRoute(path: string, opts: { auth?: AuthContextValue } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={newClient()}>
      <AuthContext.Provider value={opts.auth ?? makeAuthValue()}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return router
}

/**
 * Render the route tree with the REAL AuthProvider — for auth-flow tests that
 * drive login/register end-to-end through the fetch wrapper (MSW-backed).
 */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={newClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}
