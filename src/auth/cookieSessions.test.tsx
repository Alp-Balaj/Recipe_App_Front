// ─────────────────────────────────────────────────────────────────────────
// Cookie sessions (KAN-20, ADR-0009) — the behaviours the reshape has to keep.
//
// These test the wrapper and the auth store as a pair, because that is the pair
// the change moved: the wrapper stopped attaching a bearer and started
// refreshing, and the store stopped persisting a session and started asking the
// server for one. Neither half is meaningful alone.
//
// jsdom does not model `httpOnly` cookies, and nothing here pretends it does.
// What is testable from script is exactly what the app itself can see: whether a
// request went out, what it carried, and what the store did with the answer.
// ─────────────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/utils'
import { apiFetch, ApiUnauthorizedError, setSessionActive, setUnauthorizedHandler } from '@/api/client'

const SESSION_MARKER = 'recipe_app_session'

describe('apiFetch — cookies instead of a bearer', () => {
  it('sends no Authorization header and opts in to same-origin credentials', async () => {
    let sawAuthorization: string | null = null
    let sawCredentials: RequestCredentials | undefined

    const realFetch = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      sawAuthorization = new Headers(init?.headers).get('Authorization')
      sawCredentials = init?.credentials
      return realFetch(input as RequestInfo, init)
    })

    server.use(http.get('*/recipes', () => HttpResponse.json({ items: [], nextCursor: null })))
    setSessionActive(true)

    await apiFetch('/recipes')

    expect(sawAuthorization).toBeNull()
    // The cookie only rides along because the request asks for it. Dropping this
    // would 401 every call in production while every test still passed.
    expect(sawCredentials).toBe('same-origin')
    spy.mockRestore()
  })

  // The access cookie expires every few minutes by design, so this is ordinary
  // traffic rather than an error path — and it must be invisible to the caller.
  it('refreshes once and retries when a live session 401s', async () => {
    let attempts = 0
    let refreshes = 0

    server.use(
      http.get('*/recipes', () => {
        attempts += 1
        return attempts === 1
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ items: [], nextCursor: null })
      }),
      http.post('*/auth/refresh', () => {
        refreshes += 1
        return HttpResponse.json({ userId: 'u', username: 'u', role: 'User' })
      }),
    )

    setSessionActive(true)
    await expect(apiFetch('/recipes')).resolves.toBeTruthy()

    expect(refreshes).toBe(1)
    expect(attempts).toBe(2)
  })

  // Retried EXACTLY once. If the refresh worked and the call still 401s, the
  // problem is not the access token, and retrying again is a loop.
  it('gives up after one retry and clears the session', async () => {
    let cleared = false
    setUnauthorizedHandler(() => {
      cleared = true
    })

    let attempts = 0
    server.use(
      http.get('*/recipes', () => {
        attempts += 1
        return new HttpResponse(null, { status: 401 })
      }),
      http.post('*/auth/refresh', () =>
        HttpResponse.json({ userId: 'u', username: 'u', role: 'User' }),
      ),
    )

    setSessionActive(true)
    await expect(apiFetch('/recipes')).rejects.toBeInstanceOf(ApiUnauthorizedError)

    expect(attempts).toBe(2)
    expect(cleared).toBe(true)
  })

  // Guest access (D9). A browsing guest has no session to expire, so a 401 from a
  // gated endpoint is an answer — not a reason to refresh, and not a reason to
  // "log out" somebody who was never logged in.
  it('does not refresh or clear the session for a guest', async () => {
    let cleared = false
    let refreshes = 0
    setUnauthorizedHandler(() => {
      cleared = true
    })

    server.use(
      http.get('*/recipes', () => new HttpResponse(null, { status: 401 })),
      http.post('*/auth/refresh', () => {
        refreshes += 1
        return new HttpResponse(null, { status: 401 })
      }),
    )

    setSessionActive(false)
    await expect(apiFetch('/recipes')).rejects.toBeInstanceOf(ApiUnauthorizedError)

    expect(refreshes).toBe(0)
    expect(cleared).toBe(false)
  })

  // SINGLE-FLIGHT. A booting page fires several calls at once; without this each
  // would rotate the refresh token, and the ones that landed late would present a
  // token that had just been retired and be signed out for it.
  it('shares one refresh across concurrent 401s', async () => {
    let refreshes = 0
    const seen = new Set<string>()

    server.use(
      http.get('*/recipes/:id', ({ params }) => {
        const id = String(params.id)
        if (!seen.has(id)) {
          seen.add(id)
          return new HttpResponse(null, { status: 401 })
        }
        return HttpResponse.json({ id })
      }),
      http.post('*/auth/refresh', async () => {
        refreshes += 1
        return HttpResponse.json({ userId: 'u', username: 'u', role: 'User' })
      }),
    )

    setSessionActive(true)
    await Promise.all([apiFetch('/recipes/a'), apiFetch('/recipes/b'), apiFetch('/recipes/c')])

    expect(refreshes).toBe(1)
  })

  // A 401 from the login endpoint means the password was wrong. Refreshing there
  // would be nonsense, and clearing the session would log out whoever was already
  // signed in on the device.
  it('never refreshes on the credential-checking endpoints', async () => {
    let refreshes = 0
    server.use(
      http.post('*/auth/login', () => new HttpResponse(null, { status: 401 })),
      http.post('*/auth/refresh', () => {
        refreshes += 1
        return HttpResponse.json({ userId: 'u', username: 'u', role: 'User' })
      }),
    )

    setSessionActive(true)
    await expect(
      apiFetch('/auth/login', { method: 'POST', body: { usernameOrEmail: 'a', password: 'b' } }),
    ).rejects.toBeInstanceOf(ApiUnauthorizedError)

    expect(refreshes).toBe(0)
  })
})

describe('AuthProvider — boot', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  // The marker is what tells boot whether to ask at all. Without it every guest
  // landing on a public page would pay for a 401 — and with `httpOnly` cookies
  // there is nothing else script can look at.
  it('asks the server who we are when the marker says a session exists', async () => {
    localStorage.setItem(SESSION_MARKER, '1')

    let asked = 0
    server.use(
      http.get('*/auth/me', () => {
        asked += 1
        return HttpResponse.json({ userId: 'u1', username: 'booted_alice', role: 'User' })
      }),
    )

    renderApp('/profile')

    expect(await screen.findByText('booted_alice')).toBeInTheDocument()
    expect(asked).toBe(1)
  })

  it('does not call /auth/me at all without the marker', async () => {
    let asked = 0
    server.use(
      http.get('*/auth/me', () => {
        asked += 1
        return HttpResponse.json({ userId: 'u1', username: 'nobody', role: 'User' })
      }),
    )

    renderApp('/profile')

    // Guest access (D9): an account-only route renders Discover with a sign-in
    // prompt rather than redirecting, so THAT is what "boot finished as a guest"
    // looks like.
    expect(await screen.findByText('DISCOVER')).toBeInTheDocument()
    expect(asked).toBe(0)
  })

  // The common case for anyone returning after an hour: the access cookie aged
  // out while the tab was closed, but the refresh cookie is still good. The boot
  // must recover silently rather than present a login screen.
  it('recovers a boot whose access cookie has expired', async () => {
    localStorage.setItem(SESSION_MARKER, '1')

    let meCalls = 0
    server.use(
      http.get('*/auth/me', () => {
        meCalls += 1
        return meCalls === 1
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ userId: 'u1', username: 'recovered_alice', role: 'User' })
      }),
      http.post('*/auth/refresh', () =>
        HttpResponse.json({ userId: 'u1', username: 'recovered_alice', role: 'User' }),
      ),
    )

    renderApp('/profile')

    expect(await screen.findByText('recovered_alice')).toBeInTheDocument()
  })

  // A marker left behind by a session the server has since forgotten. One
  // /auth/me, one failed refresh, and then signed out — never a stuck screen.
  it('clears a stale marker when the session is really gone', async () => {
    localStorage.setItem(SESSION_MARKER, '1')

    server.use(
      http.get('*/auth/me', () => new HttpResponse(null, { status: 401 })),
      http.post('*/auth/refresh', () => new HttpResponse(null, { status: 401 })),
    )

    renderApp('/profile')

    await waitFor(() => expect(localStorage.getItem(SESSION_MARKER)).toBeNull())
    expect(await screen.findByText('DISCOVER')).toBeInTheDocument()
  })
})

describe('AuthProvider — logout', () => {
  // The whole point of a real logout endpoint. Dropping a token locally left the
  // session alive on the server until it expired, which is precisely what the
  // person pressing the button was trying to prevent.
  it('tells the server, then clears the marker', async () => {
    const user = userEvent.setup()
    let loggedOut = false
    server.use(
      http.post('*/auth/logout', () => {
        loggedOut = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderApp('/login')
    await user.type(await screen.findByLabelText('Username or email'), 'dave')
    await user.type(screen.getByLabelText('Password'), 'goodpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await screen.findByText('DISCOVER')

    await user.click(screen.getByRole('button', { name: /profile/i }))
    await user.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    await user.click(await screen.findByRole('button', { name: /log out/i }))

    await waitFor(() => expect(loggedOut).toBe(true))
    expect(localStorage.getItem(SESSION_MARKER)).toBeNull()
  })

  // A user who pressed Log out on a flaky connection must not be left looking at
  // a signed-in app. The session's own expiry is the backstop for the row nobody
  // managed to delete.
  it('signs out locally even when the request fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/auth/logout', () => HttpResponse.error()))

    const router = renderApp('/login')
    await user.type(await screen.findByLabelText('Username or email'), 'erin')
    await user.type(screen.getByLabelText('Password'), 'goodpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await screen.findByText('DISCOVER')

    await user.click(screen.getByRole('button', { name: /profile/i }))
    await user.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    await user.click(await screen.findByRole('button', { name: /log out/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(localStorage.getItem(SESSION_MARKER)).toBeNull()
  })
})
