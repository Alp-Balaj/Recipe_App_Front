// ─────────────────────────────────────────────────────────────────────────
// Account recovery (KAN-19) — email verification and password reset.
//
// A NEW module, not an edit to the frozen `@/api/types` / `client` / `queryKeys`
// trio: the wire shapes here are used by three new pages and one settings
// sub-view and by nothing else, so they live beside their callers the way
// `chat.ts`, `social.ts` and `cooked.ts` do.
//
// The three CONFIRM/REQUEST calls run signed out — someone who has forgotten
// their password has no session — so nothing here assumes a bearer.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch, ApiError, ApiValidationError } from './client'
import type { AuthResponse } from './types'

/** GET /auth/email-verification — the caller's own address and its status. */
export interface EmailVerificationStatus {
  email: string
  verified: boolean
  verifiedAtUtc: string | null
}

/**
 * What the backend says about a link it would not accept. The two are
 * deliberately distinct: an EXPIRED link deserves "here, have a fresh one",
 * an INVALID one deserves "that link is not usable" — offering a new link
 * for a token that was never real is a dead end dressed up as help.
 */
export type LinkFailure = 'expired' | 'invalid'

/** POST /auth/email-verification/confirm — 200 for both of these. */
export type EmailVerificationStatusName = 'Verified' | 'AlreadyVerified'

export class LinkError extends Error {
  readonly failure: LinkFailure
  constructor(failure: LinkFailure) {
    super(failure === 'expired' ? 'That link has expired.' : 'That link is not usable.')
    this.name = 'LinkError'
    this.failure = failure
  }
}

/**
 * Both confirm endpoints answer 410 Gone for an expired link and 400 for one
 * that is not usable at all (fabricated, superseded, already spent). The split
 * lives in the STATUS rather than the body because the frozen fetch wrapper
 * surfaces only a 400 body's `title`, and a status code needs no cooperation
 * from it.
 *
 * A 400 carrying a validation dictionary is a different animal — the password
 * failed the rules, the link is fine — so it is rethrown as itself. Anything
 * else (network, 500) is not a link problem either and passes straight through.
 */
function asLinkError(err: unknown): never {
  if (err instanceof ApiValidationError) throw err
  if (err instanceof ApiError && err.status === 410) throw new LinkError('expired')
  if (err instanceof ApiError && err.status === 400) throw new LinkError('invalid')
  throw err
}

export function getEmailVerificationStatus(signal?: AbortSignal): Promise<EmailVerificationStatus> {
  return apiFetch<EmailVerificationStatus>('/auth/email-verification', { signal })
}

/** Sends a verification link to the caller's own address. A no-op once verified. */
export function requestEmailVerification(): Promise<void> {
  return apiFetch<void>('/auth/email-verification/request', { method: 'POST' })
}

export async function confirmEmailVerification(token: string): Promise<EmailVerificationStatusName> {
  try {
    const body = await apiFetch<{ status: EmailVerificationStatusName }>(
      '/auth/email-verification/confirm',
      { method: 'POST', body: { token } },
    )
    return body.status
  } catch (err) {
    return asLinkError(err)
  }
}

/**
 * Asks for a reset link. Resolves the same way whether or not the address has
 * an account — that is the backend's contract and this page must not try to
 * infer otherwise, because doing so would rebuild the account-enumeration
 * oracle the server went out of its way not to be.
 */
export function requestPasswordReset(email: string): Promise<void> {
  return apiFetch<void>('/auth/password-reset/request', { method: 'POST', body: { email } })
}

/** Spends a reset link. Resolves with a fresh session for THIS device. */
export async function resetPassword(token: string, newPassword: string): Promise<AuthResponse> {
  try {
    return await apiFetch<AuthResponse>('/auth/password-reset/confirm', {
      method: 'POST',
      body: { token, newPassword },
    })
  } catch (err) {
    return asLinkError(err)
  }
}
