// ─────────────────────────────────────────────────────────────────────────
// Auth store — identity only.
//
// KAN-20 (cookie sessions, ADR-0009) reshaped this. It used to hold a bearer
// token and persist the whole session to `localStorage`; it now holds nothing
// secret at all. The session is two `httpOnly` cookies the browser manages, and
// GET /auth/me is the sole source of identity.
//
// THE ONE THING STILL IN localStorage is a marker — the string "1" — that says
// "a session probably exists". It is not a credential and grants nothing. It is
// there because `httpOnly` cookies are invisible to script, so without it boot
// could not tell a returning user (ask the server) from a first-time visitor
// (do not), and every guest landing on a public page would pay for a 401. A
// stale marker costs exactly one /auth/me that comes back 401.
// ─────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiFetch, setSessionActive, setUnauthorizedHandler } from '@/api/client'
import type { AuthResponse, LoginRequest, MeResponse, RegisterRequest } from '@/api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  /**
   * The current identity, or null when signed out. Server truth from
   * /auth/me — never a token payload, and since KAN-20 never anything cached
   * across a reload either.
   */
  user: MeResponse | null
  /** 'loading' only while the boot-time /auth/me is in flight. */
  status: AuthStatus
  /** POST /auth/login → the server sets the session cookies. Throws ApiUnauthorizedError on bad credentials. */
  login: (req: LoginRequest) => Promise<void>
  /** POST /auth/register → signs in with ONE call. Throws ApiConflictError when taken. */
  register: (req: RegisterRequest) => Promise<void>
  /**
   * POST /auth/logout → the server deletes the session row and clears the
   * cookies. Since KAN-20 this is a real request, not a client-side token drop:
   * dropping a token locally left the session alive on the server forever, which
   * is precisely what "log out" is supposed to prevent.
   *
   * The local state is cleared whatever the request does. A user who pressed
   * Log out on a flaky connection must not be left looking at a signed-in app.
   */
  logout: () => Promise<void>
  /**
   * Adopt a session this store did not open itself (KAN-19). Password reset
   * answers with the caller's identity — and, since KAN-20, sets the session
   * cookies on the same response — and that arrives at the reset page rather
   * than here, because the page is the thing holding the one-use link.
   */
  adoptSession: (auth: AuthResponse) => void
  /**
   * Patch the cached username after a self-edit (PUT /users/me). Keeps the header
   * and avatar seed in sync immediately; the next boot's /auth/me agrees.
   * No-op when signed out.
   */
  updateUsername: (username: string) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Not the session. See the header: a hint that one exists, so boot knows whether
 * to ask the server. The old key held the whole AuthResponse including a bearer
 * token, so the name changed with the meaning — a leftover under the old key
 * reads as "no session" and simply sends the user to /login once.
 */
const SESSION_MARKER_KEY = 'recipe_app_session'

function hasSessionMarker(): boolean {
  try {
    return localStorage.getItem(SESSION_MARKER_KEY) === '1'
  } catch {
    return false
  }
}

function writeSessionMarker(present: boolean): void {
  try {
    if (present) localStorage.setItem(SESSION_MARKER_KEY, '1')
    else localStorage.removeItem(SESSION_MARKER_KEY)
  } catch {
    // Private-browsing modes can throw on write. The marker is an optimisation,
    // so losing it costs one extra /auth/me and nothing else.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const [user, setUser] = useState<MeResponse | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    hasSessionMarker() ? 'loading' : 'unauthenticated',
  )

  // Write-through: the marker, the wrapper's belief about the session, and React
  // state always move together, so no two of them can disagree about whether
  // somebody is signed in.
  const adopt = useCallback((identity: MeResponse | null) => {
    writeSessionMarker(identity !== null)
    setSessionActive(identity !== null)
    setUser(identity)
  }, [])

  const clearSession = useCallback(() => {
    adopt(null)
    setStatus('unauthenticated')
    queryClient.clear()
  }, [adopt, queryClient])

  const login = useCallback(
    async (req: LoginRequest) => {
      // The body carries identity; the SESSION arrives as Set-Cookie headers on
      // this same response and never passes through JavaScript.
      const auth = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: req })
      adopt({ userId: auth.userId, username: auth.username, role: auth.role })
      setStatus('authenticated')
    },
    [adopt],
  )

  const register = useCallback(
    async (req: RegisterRequest) => {
      const auth = await apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: req })
      adopt({ userId: auth.userId, username: auth.username, role: auth.role })
      setStatus('authenticated')
    },
    [adopt],
  )

  const adoptSession = useCallback(
    (auth: AuthResponse) => {
      adopt({ userId: auth.userId, username: auth.username, role: auth.role })
      setStatus('authenticated')
    },
    [adopt],
  )

  const logout = useCallback(async () => {
    try {
      await apiFetch<void>('/auth/logout', { method: 'POST' })
    } catch {
      // Deliberately swallowed. The server may be unreachable; the user still
      // asked to be signed out of this device, and the session's own expiry is
      // the backstop for the row nobody managed to delete.
    } finally {
      clearSession()
    }
  }, [clearSession])

  const updateUsername = useCallback((username: string) => {
    setUser((prev) => (prev && prev.username !== username ? { ...prev, username } : prev))
  }, [])

  // Register the global 401 → clear-session handler for the fetch wrapper.
  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  // Boot: ask the server who we are, exactly once. The wrapper refreshes and
  // retries underneath this if the access cookie aged out while the tab was
  // closed — which is the common case for anyone returning after an hour.
  const validatedRef = useRef(false)
  useEffect(() => {
    if (validatedRef.current) return
    validatedRef.current = true

    if (!hasSessionMarker()) {
      setStatus('unauthenticated')
      return
    }

    // The wrapper's guest check keys off this, so it has to be true BEFORE the
    // call: without it the boot 401 would be read as a guest's and never trigger
    // the refresh that is the whole point of asking.
    setSessionActive(true)

    apiFetch<MeResponse>('/auth/me')
      .then((me) => {
        adopt(me)
        setStatus('authenticated')
      })
      .catch(() => {
        // A 401 has already cleared the store through the wrapper handler; other
        // failures (network) fall back to signed-out rather than to a session
        // nothing has confirmed.
        adopt(null)
        setStatus('unauthenticated')
      })
  }, [adopt])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateUsername, adoptSession }),
    [user, status, login, register, logout, updateUsername, adoptSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
