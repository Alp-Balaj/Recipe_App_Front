import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '@/router'
import { AuthContext, AuthProvider, type AuthContextValue } from '@/auth/AuthContext'
import type { MeResponse } from '@/api/types'

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// KAN-20: the auth store holds IDENTITY now, not a session. There is no token
// here because there is no token anywhere in the app — the session is two
// `httpOnly` cookies the browser owns.
export const TEST_USER: MeResponse = {
  userId: '11111111-1111-1111-1111-111111111111',
  username: 'testuser',
  role: 'User',
}

/** stream D (governor): the same session, promoted — for /admin surface tests. */
export const TEST_ADMIN: MeResponse = { ...TEST_USER, username: 'testadmin', role: 'Admin' }

/** Build a fake auth context value; authenticated by default. */
export function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: TEST_USER,
    status: 'authenticated',
    login: async () => {},
    register: async () => {},
    logout: async () => {},
    updateUsername: () => {},
    adoptSession: () => {},
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
export function renderRoute(
  path: string,
  // `client` (week/shopping rework, Task 6): this function returns the ROUTER, so
  // there is otherwise no handle on the cache — and a surface that renders stale
  // data while offline can only be tested by seeding that cache first. Optional
  // and defaulted, so nothing existing changes.
  opts: { auth?: AuthContextValue; client?: QueryClient } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={opts.client ?? newClient()}>
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
