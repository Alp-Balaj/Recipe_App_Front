// ─────────────────────────────────────────────────────────────────────────
// The second factor (KAN-21) — enrolling an authenticator, answering a sign-in
// challenge, and the three ways back in when the authenticator is gone.
//
// A NEW module, not an edit to the frozen `@/api/types` / `client` / `queryKeys`
// trio, following `account.ts` and `sessions.ts`: these wire shapes are read by
// two auth screens, one settings sub-view and one recovery page, and by nothing
// else. (The one thing that DID have to go in a frozen module is
// `MeResponse.secondFactorResetEffectiveAtUtc` — the pending-reset warning has
// to reach every session, and identity is the only thing every session reads.)
//
// Half of these calls run SIGNED OUT by necessity: somebody answering a sign-in
// challenge has no session yet, and somebody asking to have their factor
// removed cannot sign in at all — that is why they are asking.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch, ApiError } from './client'
import type { AuthResponse } from './types'

// ── Enrolment ────────────────────────────────────────────────────────────

/** POST /auth/second-factor/enrolment — what an authenticator needs to be set up. */
export interface SecondFactorEnrolment {
  /**
   * The base32 secret, for someone typing it in by hand. Shown beside the QR
   * rather than instead of it: a desktop browser and a phone camera is the
   * common case, and a desktop browser with no camera at all is the case that
   * would otherwise be impossible.
   */
  secret: string
  /** The `otpauth://` URI the QR encodes. Same secret, in the form a camera reads. */
  otpAuthUri: string
}

/** GET /auth/second-factor — everything the Security screen needs. */
export interface SecondFactorStatus {
  enrolled: boolean
  enrolledAt: string | null
  recoveryCodesRemaining: number
  /**
   * Enrolment REQUIRES a verified email, because email is one of the recovery
   * paths. It rides on the status so the screen can explain the requirement
   * before the button is pressed rather than after it fails.
   */
  emailVerified: boolean
  /** Set while an emailed reset is counting down. Null the rest of the time. */
  resetEffectiveAtUtc: string | null
}

export interface RecoveryCodes {
  /**
   * Plaintext, for the only moment these exist outside a digest. There is no
   * endpoint that repeats them — only one that replaces the whole set.
   */
  codes: string[]
}

export function getSecondFactorStatus(signal?: AbortSignal): Promise<SecondFactorStatus> {
  return apiFetch<SecondFactorStatus>('/auth/second-factor', { signal })
}

/**
 * Begin enrolment. Rejects with `ApiError` (409) when the account cannot enrol —
 * already enrolled, or its email is not verified. The screen re-reads the status
 * to say which, rather than trusting an error string to stay in sync with it.
 */
export function beginSecondFactorEnrolment(): Promise<SecondFactorEnrolment> {
  return apiFetch<SecondFactorEnrolment>('/auth/second-factor/enrolment', { method: 'POST' })
}

/**
 * Prove a code from the new authenticator and turn the factor on. Resolves with
 * the recovery codes for their one appearance.
 *
 * This second step is why a mis-scanned QR costs a retry instead of an account:
 * the factor does not exist until a code computed from it has come back.
 */
export function confirmSecondFactorEnrolment(code: string): Promise<RecoveryCodes> {
  return apiFetch<RecoveryCodes>('/auth/second-factor/enrolment/confirm', {
    method: 'POST',
    body: { code },
  })
}

/** Turn the factor off. Needs a current code of either kind — removing it is exactly the act that should produce one. */
export function disableSecondFactor(code: string): Promise<void> {
  return apiFetch<void>('/auth/second-factor/disable', { method: 'POST', body: { code } })
}

/** Throw the recovery codes away and issue a fresh set. The old ones stop working immediately. */
export function reissueRecoveryCodes(code: string): Promise<RecoveryCodes> {
  return apiFetch<RecoveryCodes>('/auth/second-factor/recovery-codes', {
    method: 'POST',
    body: { code },
  })
}

// ── The sign-in challenge ────────────────────────────────────────────────

/**
 * What POST /auth/login answers for an ENROLLED account. No session was opened;
 * the token names the challenge that has to be answered before one is.
 *
 * It is NOT a credential, which is why holding it in component state does not
 * contradict KAN-20's rule that the SESSION never reaches JavaScript: on its
 * own it opens nothing, and it only becomes a session in exchange for a code.
 */
export interface SecondFactorChallenge {
  challengeToken: string
  expiresAtUtc: string
  /** Always true. The discriminator that tells this apart from an `AuthResponse`. */
  challengeRequired: true
}

/** POST /auth/login and /auth/password-reset/confirm both answer one of these two shapes. */
export type SignInOutcome = AuthResponse | SecondFactorChallenge

export function isChallenge(outcome: SignInOutcome): outcome is SecondFactorChallenge {
  return (outcome as SecondFactorChallenge).challengeRequired === true
}

/** Why a challenge could not be answered — the three the screen has to say different things about. */
export type ChallengeFailure =
  /**
   * Wrong code, and the sign-in is still alive. `attemptsRemaining` says how alive —
   * or NULL when the server did not say. Null rather than zero, because zero is a
   * claim: "no attempts left" printed under a form that still works is worse than
   * saying nothing, and an empty or non-JSON 401 (a proxy error page, say) would
   * otherwise produce exactly that.
   */
  | { kind: 'invalid'; attemptsRemaining: number | null }
  /** Expired, spent, or five wrong codes: this sign-in is over and the password has to be typed again. */
  | { kind: 'gone' }
  /** Backoff is running (ADR-0008). A RECOVERY CODE still works — the screen must say so. */
  | { kind: 'throttled'; retryAfterSeconds: number }

export class ChallengeError extends Error {
  readonly failure: ChallengeFailure
  constructor(failure: ChallengeFailure) {
    super(failure.kind)
    this.name = 'ChallengeError'
    this.failure = failure
  }
}

/**
 * Answer a challenge with either a six-digit authenticator code or a recovery
 * code. The caller does not say which — the server tells them apart by shape,
 * so the screen offers one field instead of asking the user to classify their
 * own emergency.
 */
export async function answerChallenge(challengeToken: string, code: string): Promise<AuthResponse> {
  try {
    return await apiFetch<AuthResponse>('/auth/challenge', {
      method: 'POST',
      body: { challengeToken, code },
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) throw new ChallengeError({ kind: 'gone' })
    if (err instanceof ApiError && err.status === 429) {
      throw new ChallengeError({
        kind: 'throttled',
        retryAfterSeconds: numberFrom(err, 'retryAfterSeconds') ?? 60,
      })
    }
    if (err instanceof ApiError && err.status === 401) {
      throw new ChallengeError({
        kind: 'invalid',
        attemptsRemaining: numberFrom(err, 'attemptsRemaining'),
      })
    }
    throw err
  }
}

// ── The emailed reset (the slow rung of the ladder) ──────────────────────

/**
 * Ask for a link that starts the countdown. Resolves the same way for an address
 * with an enrolled account, one without a factor, and one with no account at
 * all — that is the backend's contract, and inferring otherwise here would
 * rebuild the enumeration oracle it goes out of its way not to be.
 */
export function requestSecondFactorReset(email: string): Promise<void> {
  return apiFetch<void>('/auth/second-factor/reset/request', { method: 'POST', body: { email } })
}

export interface SecondFactorResetScheduled {
  /** When the factor actually comes off. The screen must lead with this, not with "done". */
  effectiveAtUtc: string
}

/** Whether a reset link failed because it aged out or because it was never usable. */
export type ResetLinkFailure = 'expired' | 'invalid'

export class ResetLinkError extends Error {
  readonly failure: ResetLinkFailure
  constructor(failure: ResetLinkFailure) {
    super(failure === 'expired' ? 'That link has expired.' : 'That link is not usable.')
    this.name = 'ResetLinkError'
    this.failure = failure
  }
}

/**
 * Spend the link and start the 48-hour wait. It does NOT remove anything — the
 * delay is the feature, and a screen that implies otherwise leaves the user
 * waiting for something they think already happened.
 */
export async function confirmSecondFactorReset(token: string): Promise<SecondFactorResetScheduled> {
  try {
    return await apiFetch<SecondFactorResetScheduled>('/auth/second-factor/reset/confirm', {
      method: 'POST',
      body: { token },
    })
  } catch (err) {
    if (err instanceof ApiError && err.status === 410) throw new ResetLinkError('expired')
    if (err instanceof ApiError && err.status === 400) throw new ResetLinkError('invalid')
    throw err
  }
}

/**
 * Stop a pending reset. Needs a session — which means it needs the factor, which
 * means it is available to exactly the person entitled to use it and not to
 * whoever is reading the mailbox.
 */
export function cancelSecondFactorReset(): Promise<void> {
  return apiFetch<void>('/auth/second-factor/reset', { method: 'DELETE' })
}

/**
 * Read a number out of an error body without trusting its shape. `ApiError.body` is
 * whatever the server sent — untyped by construction — so anything that is not a finite
 * number comes back as NULL rather than as a made-up figure. Callers decide what to say
 * when the server did not say; nothing here invents a number to put in a sentence about
 * somebody's account.
 */
function numberFrom(err: ApiError, key: string): number | null {
  const value = err.body?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
