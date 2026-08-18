// ─────────────────────────────────────────────────────────────────────────
// Active devices (KAN-20) — the sessions a person is signed in on, and the two
// ways to end them.
//
// A NEW module, not an edit to the frozen trio: these wire shapes are read by
// one settings sub-view and nothing else, so they live beside their caller the
// way `account.ts`, `chat.ts` and `cooked.ts` do.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

/** GET /auth/sessions — one signed-in device. */
export interface SessionSummary {
  id: string
  /**
   * A coarse label the server derives from the User-Agent ("Chrome on Windows",
   * "Unknown device"). Deliberately never the raw string: this list answers "is
   * that one me?", and a user-agent string answers it worse than two words do.
   */
  label: string
  createdAt: string
  lastSeenAtUtc: string
  /** The device making the request. Exactly one row carries it. */
  current: boolean
}

export function getSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
  return apiFetch<SessionSummary[]>('/auth/sessions', { signal })
}

/**
 * End one device's session. Allowed for the CURRENT device too, where it is the
 * same act as logging out — the server clears this browser's cookies in that
 * case, so the caller must treat it as a sign-out rather than a list edit.
 */
export function revokeSession(sessionId: string): Promise<void> {
  return apiFetch<void>(`/auth/sessions/${sessionId}`, { method: 'DELETE' })
}

/**
 * Sign out every OTHER device, keeping this one. The asymmetry is the point:
 * someone reaching for this is usually worried about a device that is not the
 * one in their hand, and signing them out of that one too would make the button
 * something people press once and then never trust again.
 */
export function revokeOtherSessions(): Promise<void> {
  return apiFetch<void>('/auth/sessions/others', { method: 'DELETE' })
}
