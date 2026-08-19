// ─────────────────────────────────────────────────────────────────────────
// The one fetch wrapper every data call goes through.
//
// FROZEN at checkpoint 02. RESHAPED by KAN-20 (cookie sessions) as its own
// reviewed commit, per the frozen-modules rule — this was not an additive edit:
// the bearer token this module used to attach no longer exists in JavaScript.
//
// Responsibilities:
//  - prefix every path with /api (the Vite dev proxy strips it → :5109)
//  - send the session cookies (`credentials: 'same-origin'`; see below)
//  - send/receive JSON in the backend's casing (camelCase already — no rewrite)
//  - treat ANY 2xx as success (POST /recipes answers 201, not 200)
//  - on a 401 with a live session, refresh once and retry (see below)
//  - translate error responses into typed errors:
//      400 → ApiValidationError (carries the PascalCase-keyed errors dict)
//      429/5xx/other → ApiError, whose `body` carries the parsed payload
//            (KAN-21) for the two answers that put a number in it
//      401 → ApiUnauthorizedError; clears the session ONLY after a refresh
//            attempt has also failed, and only when a session was believed
//            live. A guest 401 (guest access, D9) surfaces as a normal error
//            instead, so a browsing guest is never "logged out" by a stray
//            401. /auth/login is likewise exempt (a 401 there is bad
//            credentials, not an expired session).
//
// WHY THERE IS NO TOKEN HERE ANY MORE (KAN-20, ADR-0009). The session lives in
// two `httpOnly` cookies the browser attaches by itself, so this module has
// nothing to hold and nothing to leak. What it still needs is a way to tell a
// GUEST's 401 from an EXPIRED SESSION's 401 — the distinction the old `hadToken`
// check made — and `httpOnly` cookies are invisible to script, so the auth store
// registers `setSessionActive` instead. It is a belief, not a credential: wrong
// in the harmless direction (one refresh that 401s) and never trusted by the
// server for anything.
// ─────────────────────────────────────────────────────────────────────────

import type {
  ConflictResponse,
  ValidationProblemResponse,
} from './types'

const API_PREFIX = '/api'

/**
 * Whether the auth store believes a session is live. Registered by the auth
 * store on sign-in and cleared on sign-out; see the header for why this replaced
 * the bearer token and why a stale `true` is harmless.
 */
let sessionActive = false
export function setSessionActive(active: boolean): void {
  sessionActive = active
}

/**
 * The auth store registers a handler that clears the session when the wrapper
 * sees a 401 that a refresh could not rescue. Route protection then bounces the
 * user to /login — the wrapper never touches the router directly.
 */
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

// ── Typed errors ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number
  /**
   * KAN-21 — SANCTIONED ADDITIVE EDIT to this frozen module, landing as its own
   * reviewed commit per the rule. Nothing already here changed shape: this is a
   * new optional field, and every existing `catch` is unaffected.
   *
   * The parsed error body, when the response carried one. It exists because two
   * KAN-21 answers put a NUMBER in the body that the screen has to say out
   * loud — how many code attempts are left before a sign-in dies, and how many
   * seconds the escalating backoff wants — and neither can be recovered from a
   * status code. Callers must treat it as untyped: it is whatever the server
   * sent, which for an unexpected 5xx may be nothing at all.
   */
  readonly body?: Record<string, unknown>

  constructor(status: number, message: string, body?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** 400 ValidationProblem — `errors` is keyed by PascalCase property paths. */
export class ApiValidationError extends ApiError {
  readonly errors: Record<string, string[]>
  constructor(errors: Record<string, string[]>, message = 'Validation failed') {
    super(400, message)
    this.name = 'ApiValidationError'
    this.errors = errors
  }
}

/** 401 — either an expired session (handled globally) or bad login credentials. */
export class ApiUnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized', body?: Record<string, unknown>) {
    super(401, message, body)
    this.name = 'ApiUnauthorizedError'
  }
}

/** 409 — POST /auth/register when the username or email is already taken. */
export class ApiConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message)
    this.name = 'ApiConflictError'
  }
}

// ── Refresh ─────────────────────────────────────────────────────────────────

/**
 * Endpoints where a 401 is an ANSWER rather than an expired access token, so a
 * refresh-and-retry would be noise at best and a loop at worst.
 *
 * `/auth/me` is deliberately NOT here. It is the boot call, and the boot call is
 * the single most likely place to arrive with an access cookie that aged out
 * while the tab was closed — refreshing there is exactly the point.
 */
// KAN-21 added '/auth/challenge' for the same reason '/auth/login' is here, and the
// consequence of leaving it out is worse than it looks: a 401 there means the CODE was
// wrong, and a refresh-and-retry would re-POST the same challengeToken with the same wrong
// code — spending TWO of the challenge's five attempts per typo, and making the
// "attempts left" count the screen shows jump by two. That happens for real whenever
// somebody who is already signed in on the device clicks their emailed reset link.
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/challenge',
]

/**
 * KAN-21 — SANCTIONED ADDITIVE EDIT, same reviewed commit as the rest.
 *
 * The auth store registers a handler for the identity a REFRESH answers with. The refresh
 * response has always carried one; this module used to throw it away, which was fine while
 * identity was only a name and a role — a long-open tab had nothing to learn.
 *
 * It does now. A second-factor reset somebody started by email is a 48-hour countdown that
 * the account holder has to SEE, and the only person who can stop it is whoever is still
 * signed in. Feeding this back is what makes "every live session is warned within one
 * access-token lifetime" true rather than aspirational: refresh is the one call every live
 * session makes on its own, without a poll and without a socket.
 */
type IdentityHandler = (identity: unknown) => void
let identityHandler: IdentityHandler | null = null
export function setIdentityHandler(handler: IdentityHandler | null): void {
  identityHandler = handler
}

/**
 * The one in-flight refresh, shared by every caller that wants one.
 *
 * SINGLE-FLIGHT IS NOT AN OPTIMISATION. A page that boots fires several requests
 * at once; without this they would each POST /auth/refresh, each rotation would
 * supersede the last, and the ones that arrived late would present a token that
 * had just been retired and be signed out. The server keeps a short grace window
 * for the case this cannot cover — a SECOND TAB, which has its own module state
 * and so its own promise.
 */
let inFlightRefresh: Promise<boolean> | null = null

/**
 * Ask the server for a new access cookie. Resolves true when the session
 * survived. Safe to call concurrently — everyone waits on the same request.
 *
 * Exported because the three multipart modules (`images`, `import`, `scan`) do
 * their own `fetch` — the wrapper is JSON-shaped — and they must share this
 * promise rather than start a competing rotation of their own.
 */
export function refreshSession(): Promise<boolean> {
  inFlightRefresh ??= fetch(`${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'same-origin',
  })
    .then(async (res) => {
      if (!res.ok) return false
      // KAN-21: hand the identity back to the store — see setIdentityHandler. A body
      // that will not parse is not a reason to fail a refresh that the server accepted,
      // so it is read defensively and ignored when absent.
      const identity = await safeJson(res)
      if (identity) identityHandler?.(identity)
      return true
    })
    .catch(() => false)
    .finally(() => {
      inFlightRefresh = null
    })

  return inFlightRefresh
}

// ── Request ─────────────────────────────────────────────────────────────────

export type QueryValue = string | number | boolean | null | undefined | string[]

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** JSON request body — serialized as-is (camelCase keys match the DTOs). */
  body?: unknown
  /**
   * Query params. Array values are emitted as repeated pairs
   * (?tags=a&tags=b — what the backend expects for match-ALL tag filtering);
   * null/undefined values are omitted.
   */
  query?: Record<string, QueryValue>
  signal?: AbortSignal
}

function buildQueryString(query?: Record<string, QueryValue>): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else {
      params.append(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function parseBody<T>(res: Response): Promise<T> {
  // 204 / empty body → nothing to parse (e.g. DELETE 204).
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

/**
 * Make a request through the /api proxy. Resolves with the parsed JSON body on
 * any 2xx; throws a typed ApiError otherwise.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const send = () =>
    fetch(`${API_PREFIX}${path}${buildQueryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      // Explicit rather than relying on the default. The session rides entirely
      // on cookies now, so a future default change here would log everyone out.
      credentials: 'same-origin',
    })

  let res = await send()

  // The access cookie expires every few minutes by design, so this path is
  // ordinary traffic rather than an error case. Retried exactly ONCE: if the
  // refresh worked and the call still 401s, the problem is not the token.
  if (res.status === 401 && sessionActive && !NO_REFRESH_PATHS.includes(path)) {
    if (await refreshSession()) {
      res = await send()
    }
  }

  if (res.ok) return parseBody<T>(res)

  return handleErrorResponse(res, path)
}

async function handleErrorResponse(res: Response, path: string): Promise<never> {
  if (res.status === 400) {
    const problem = (await safeJson(res)) as ValidationProblemResponse | null
    if (problem && problem.errors) {
      throw new ApiValidationError(problem.errors, problem.title ?? 'Validation failed')
    }
    throw new ApiError(400, problem?.title ?? 'Bad request')
  }

  if (res.status === 401) {
    // Everything a refresh could rescue has already been tried by the time we
    // get here. What is left is a session that is genuinely over — or no session
    // at all, which is a guest hitting a gated endpoint (defense-in-depth) and
    // has nothing to clear. /auth/login and /auth/register are exempt for a
    // third reason: a 401 there means the credentials were wrong.
    //
    // KAN-21 puts /auth/challenge in the same group, and for exactly the same
    // reason: a 401 there means the CODE was wrong. Signing somebody out of an
    // unrelated live session because they mistyped six digits on the login
    // screen would be a bug with no obvious cause.
    const isCredentialCheck =
      path === '/auth/login' || path === '/auth/register' || path === '/auth/challenge'
    if (!isCredentialCheck && sessionActive) unauthorizedHandler?.()

    // The body is read only for the credential checks — the ones whose 401 is an
    // ANSWER rather than an expiry, and the only ones whose body carries anything
    // (KAN-21's remaining-attempts count).
    const details = isCredentialCheck ? await safeJson(res) : null
    throw new ApiUnauthorizedError(undefined, details ?? undefined)
  }

  if (res.status === 409) {
    const conflict = (await safeJson(res)) as ConflictResponse | null
    throw new ApiConflictError(conflict?.error ?? 'Conflict')
  }

  const data = await safeJson(res)
  const message =
    (data && (data.title || data.error || data.message)) || res.statusText || 'Request failed'
  // KAN-21: the body rides along (see ApiError.body) so a 429's retry-after can
  // reach the screen. Everything that only reads `status` and `message` is
  // untouched.
  throw new ApiError(res.status, message, data ?? undefined)
}
