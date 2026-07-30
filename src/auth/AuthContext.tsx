// ─────────────────────────────────────────────────────────────────────────
// Auth store — token + AuthResponse, persisted to localStorage.
//
// On boot with a persisted token, GET /auth/me validates it rather than
// trusting stale localStorage; an invalid/expired token clears the store.
// The wrapper (src/api/client.ts) also calls back here to clear the session
// on any 401 that isn't a failed login.
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
import { apiFetch, setAuthToken, setUnauthorizedHandler } from '@/api/client'
import type { AuthResponse, LoginRequest, MeResponse, RegisterRequest } from '@/api/types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  /** The current session, or null when signed out. */
  user: AuthResponse | null
  /** 'loading' only while the boot-time /auth/me validation is in flight. */
  status: AuthStatus
  /** POST /auth/login → persists the session. Throws ApiUnauthorizedError on bad credentials. */
  login: (req: LoginRequest) => Promise<void>
  /** POST /auth/register → returns a full AuthResponse and logs in with ONE call. Throws ApiConflictError when taken. */
  register: (req: RegisterRequest) => Promise<void>
  /** Clears the session (localStorage + token + query cache). */
  logout: () => void
  /**
   * Patch the cached username after a self-edit (PUT /users/me). Keeps the header
   * and avatar seed in sync immediately; a later /auth/me boot is now DB-backed and
   * agrees. No-op when signed out.
   */
  updateUsername: (username: string) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_KEY = 'recipe_app_auth'

function loadPersisted(): AuthResponse | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed.token === 'string' ? (parsed as AuthResponse) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const [user, setUser] = useState<AuthResponse | null>(() => loadPersisted())
  const [status, setStatus] = useState<AuthStatus>(() =>
    loadPersisted() ? 'loading' : 'unauthenticated',
  )

  // Write-through: keep localStorage, the wrapper's token, and React state in sync.
  const persist = useCallback((auth: AuthResponse | null) => {
    if (auth) localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
    else localStorage.removeItem(STORAGE_KEY)
    setAuthToken(auth?.token ?? null)
    setUser(auth)
  }, [])

  const clearSession = useCallback(() => {
    persist(null)
    setStatus('unauthenticated')
    queryClient.clear()
  }, [persist, queryClient])

  const login = useCallback(
    async (req: LoginRequest) => {
      const auth = await apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: req })
      persist(auth)
      setStatus('authenticated')
    },
    [persist],
  )

  const register = useCallback(
    async (req: RegisterRequest) => {
      // Register returns a full AuthResponse (token included) — one call logs in.
      const auth = await apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: req })
      persist(auth)
      setStatus('authenticated')
    },
    [persist],
  )

  const logout = useCallback(() => {
    clearSession()
  }, [clearSession])

  const updateUsername = useCallback(
    (username: string) => {
      setUser((prev) => {
        if (!prev || prev.username === username) return prev
        const next = { ...prev, username }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    [],
  )

  // Register the global 401 → clear-session handler for the fetch wrapper.
  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  // Boot: validate a persisted token exactly once via GET /auth/me.
  const validatedRef = useRef(false)
  useEffect(() => {
    if (validatedRef.current) return
    validatedRef.current = true

    const persisted = loadPersisted()
    if (!persisted) {
      setStatus('unauthenticated')
      return
    }

    setAuthToken(persisted.token)
    apiFetch<MeResponse>('/auth/me')
      .then((me) => {
        // Trust the server's identity over whatever was cached. stream D: role
        // rides along — a promotion (or a pre-governor session with no cached
        // role) corrects itself on the next boot, since /auth/me is DB-backed.
        persist({ ...persisted, userId: me.userId, username: me.username, role: me.role })
        setStatus('authenticated')
      })
      .catch(() => {
        // 401 already cleared the store via the wrapper handler; other errors
        // (network) also fall back to signed-out rather than a stale session.
        persist(null)
        setStatus('unauthenticated')
      })
  }, [persist])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, updateUsername }),
    [user, status, login, register, logout, updateUsername],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
