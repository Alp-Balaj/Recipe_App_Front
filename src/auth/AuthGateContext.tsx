// ─────────────────────────────────────────────────────────────────────────
// Auth gate — the guest-access seam (guest-access plan §4.3).
//
// `unauthenticated` is a valid, browsable state ("guest"), not a redirect.
// Interactions call requireAuth() before firing: authenticated → true (go
// ahead), guest → the login modal opens and the call site bails. After a
// successful login the modal just closes — the pending action is NOT resumed
// (decision D4).
//
// Mounted by AppShell (every gated surface lives under it); the modal itself
// is LoginModal.tsx, rendered by AppShell whenever promptOpen is true.
// ─────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'

export interface AuthGateContextValue {
  /** True when the visitor is browsing signed-out (status === 'unauthenticated'). */
  isGuest: boolean
  /** True while the login modal is open. */
  promptOpen: boolean
  /** Open the login modal (e.g. the guest tapped a gated tab or a sign-in CTA). */
  promptLogin: () => void
  /** Close the login modal (dismiss, or after a successful login — D4). */
  closePrompt: () => void
  /**
   * Gate for interaction call sites: returns true when authenticated; when a
   * guest, opens the login modal and returns false. Call sites do
   * `if (!requireAuth()) return` before firing a mutation.
   */
  requireAuth: () => boolean
}

const AuthGateContext = createContext<AuthGateContextValue | null>(null)

/**
 * The account-only routes (guest-access plan §4.2) — mirrors the activeTab
 * mapping in navItems.ts. A guest deep-linking one of these renders Discover
 * with the login modal open (AppShell owns that behavior); everything else
 * under the shell is guest-browsable.
 */
export function requiresAuth(pathname: string): boolean {
  return (
    pathname === '/chat' ||
    pathname.startsWith('/chat/') ||
    pathname === '/profile' ||
    pathname.startsWith('/profile/') ||
    pathname === '/recipes/new' ||
    pathname === '/recipes/mine' ||
    // stream D (governor): the admin surface is account-only; the role check
    // itself happens inside AdminPage (and, authoritatively, on the server).
    pathname === '/admin' ||
    // open-loops slice 3: notifications are inherently account-only — every
    // endpoint behind this route is caller-scoped, so a guest deep-linking it
    // would otherwise render an empty page against three 401s.
    pathname === '/notifications' ||
    // Cooked (KAN-4): a private collection of the caller's own dishes, so its
    // one endpoint is caller-scoped and answers 401 to a guest. Without this
    // line a guest deep-linking /cooked would get "Couldn't load your dishes"
    // — a bug that reads as a broken page rather than as a sign-in prompt, and
    // exactly the one /plan/cooks still has.
    pathname === '/cooked' ||
    // KAN-5: and the dish page behind it, on the same terms — both endpoints it
    // reads are caller-scoped and answer 401, so a guest deep-linking one dish
    // would otherwise get "Couldn't load this dish" instead of the sign-in
    // prompt. A prefix, not an exact match: every path under /cooked/ is one of
    // the caller's own dishes.
    pathname.startsWith('/cooked/')
  )
}

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const [promptOpen, setPromptOpen] = useState(false)

  const isGuest = status === 'unauthenticated'

  const promptLogin = useCallback(() => setPromptOpen(true), [])
  const closePrompt = useCallback(() => setPromptOpen(false), [])

  const requireAuth = useCallback(() => {
    if (status === 'authenticated') return true
    setPromptOpen(true)
    return false
  }, [status])

  const value = useMemo<AuthGateContextValue>(
    () => ({ isGuest, promptOpen, promptLogin, closePrompt, requireAuth }),
    [isGuest, promptOpen, promptLogin, closePrompt, requireAuth],
  )

  return <AuthGateContext.Provider value={value}>{children}</AuthGateContext.Provider>
}

export function useAuthGate(): AuthGateContextValue {
  const ctx = useContext(AuthGateContext)
  if (!ctx) throw new Error('useAuthGate must be used within an AuthGateProvider')
  return ctx
}
