// ─────────────────────────────────────────────────────────────────────────
// The one fetch wrapper every data call goes through.
//
// FROZEN at checkpoint 02: additive-only, coordinated edits from here on.
//
// Responsibilities:
//  - prefix every path with /api (the Vite dev proxy strips it → :5109)
//  - attach the bearer token when the session holds one
//  - send/receive JSON in the backend's casing (camelCase already — no rewrite)
//  - treat ANY 2xx as success (POST /recipes answers 201, not 200)
//  - translate error responses into typed errors:
//      400 → ApiValidationError (carries the PascalCase-keyed errors dict)
//      401 → ApiUnauthorizedError; clears the session + redirects, EXCEPT for
//            /auth/login (a 401 there means bad credentials, not expiry)
//      409 → ApiConflictError (carries the {error} message)
// ─────────────────────────────────────────────────────────────────────────

import type {
  ConflictResponse,
  ValidationProblemResponse,
} from './types'

const API_PREFIX = '/api'

/** The auth store registers the current token here so the wrapper can attach it. */
let authToken: string | null = null
export function setAuthToken(token: string | null): void {
  authToken = token
}

/**
 * The auth store registers a handler that clears the session when the wrapper
 * sees a 401 on any request other than /auth/login. Route protection then
 * bounces the user to /login — the wrapper never touches the router directly.
 */
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

// ── Typed errors ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
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
  constructor(message = 'Unauthorized') {
    super(401, message)
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
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

  const res = await fetch(`${API_PREFIX}${path}${buildQueryString(query)}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  })

  if (res.ok) return parseBody<T>(res)

  return handleErrorResponse(res, path)
}

async function handleErrorResponse(res: Response, path: string): Promise<never> {
  const isLoginAttempt = path === '/auth/login'

  if (res.status === 400) {
    const problem = (await safeJson(res)) as ValidationProblemResponse | null
    if (problem && problem.errors) {
      throw new ApiValidationError(problem.errors, problem.title ?? 'Validation failed')
    }
    throw new ApiError(400, problem?.title ?? 'Bad request')
  }

  if (res.status === 401) {
    // A 401 from login is "wrong credentials", not an expired session — do NOT
    // clear the store or redirect. Every other 401 means the token is no good.
    if (!isLoginAttempt) unauthorizedHandler?.()
    throw new ApiUnauthorizedError()
  }

  if (res.status === 409) {
    const conflict = (await safeJson(res)) as ConflictResponse | null
    throw new ApiConflictError(conflict?.error ?? 'Conflict')
  }

  const data = await safeJson(res)
  const message =
    (data && (data.title || data.error || data.message)) || res.statusText || 'Request failed'
  throw new ApiError(res.status, message)
}
