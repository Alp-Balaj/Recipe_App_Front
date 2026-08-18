// ─────────────────────────────────────────────────────────────────────────
// Food scanner — the wire calls behind /scan (stream N).
//
// NEW module, following api/import.ts rather than the frozen `apiFetch`, and
// for import's own two reasons: both routes are multipart (the wrapper
// JSON.stringifies every body), and the error path must keep ProblemDetails
// `detail` — for a scan as for an import, the detail IS the message.
//
// The accept list and size ceiling are IMPORTED from api/import.ts rather than
// restated: they are the backend's ImageUploadRules, and one frontend copy of
// a backend constant is already one more than ideal.
//
// Wire contract (backend stream N):
//   POST /scan/pantry   multipart/form-data, part name "file"
//     → 200 { detected, matches, budget }
//   POST /scan/receipt  multipart/form-data, part name "file"
//     → 200 { items, budget }
//   both:
//     → 400 ValidationProblem keyed on `file`
//     → 429 daily AI budget spent, or the `scan` IP lane (15/min)
//     → 502 the vision call failed
//
// Both are 200s, deliberately: NOTHING was created. A pantry scan's matches
// point at recipes that already exist, and a receipt scan returns a DRAFT the
// user confirms through the existing POST /shopping-list (api/shopping.ts's
// addManualItem) — the scan itself persists nothing (backend decision D19).
// ─────────────────────────────────────────────────────────────────────────

import { ApiError, ApiUnauthorizedError, ApiValidationError, refreshSession } from './client'
import type { AiBudget, ValidationProblemResponse } from './types'

export { IMPORT_PHOTO_ACCEPT as SCAN_PHOTO_ACCEPT, IMPORT_PHOTO_MAX_BYTES as SCAN_PHOTO_MAX_BYTES } from './import'

/**
 * One thing the model saw. `ingredientId` is null when the catalogue has no
 * entry for it — an honest "we don't know this one", surfaced rather than
 * dropped, never a failure.
 */
export interface DetectedIngredient {
  name: string
  ingredientId: string | null
  catalogueName: string | null
}

/**
 * One recipe the scanner matched, with the numbers that make the match
 * checkable: "you have {matchedIngredientCount} of {totalIngredientCount}".
 * Matching is deterministic on the server — no model chose these.
 */
export interface PantryMatch {
  recipeId: string
  title: string
  imageUrl: string | null
  totalTimeMinutes: number
  caloriesPerServing: number | null
  matchedIngredientCount: number
  totalIngredientCount: number
  matchedIngredientNames: string[]
  missingIngredientNames: string[]
}

export interface PantryScanResponse {
  detected: DetectedIngredient[]
  matches: PantryMatch[]
  budget: AiBudget
}

/** One draft line off the receipt, as printed. `quantity` is free text. */
export interface ReceiptItem {
  name: string
  quantity: string | null
}

export interface ReceiptScanResponse {
  items: ReceiptItem[]
  budget: AiBudget
}

export function scanPantry(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<PantryScanResponse> {
  return send<PantryScanResponse>('/api/scan/pantry', file, opts)
}

export function scanReceipt(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<ReceiptScanResponse> {
  return send<ReceiptScanResponse>('/api/scan/receipt', file, opts)
}

async function send<T>(
  path: string,
  file: File,
  opts: { signal?: AbortSignal },
): Promise<T> {
  const form = new FormData()
  form.append('file', file, file.name)

  // No Content-Type header — the browser sets the multipart boundary.
  //
  // KAN-20: no Authorization header either — the session is a cookie now — and a
  // 401 gets one shared refresh-and-retry, so a scan started in a tab that has
  // been idle does not surface as "the scan failed". See api/images.ts.
  const send = () =>
    fetch(path, { method: 'POST', body: form, signal: opts.signal, credentials: 'same-origin' })

  let res = await send()
  if (res.status === 401 && (await refreshSession())) res = await send()

  if (res.ok) return (await res.json()) as T

  if (res.status === 401) throw new ApiUnauthorizedError()

  const problem = (await safeJson(res)) as (ValidationProblemResponse & { detail?: string }) | null

  if (res.status === 400 && problem?.errors) {
    throw new ApiValidationError(problem.errors, problem.title ?? 'Validation failed')
  }

  // `detail` first, `title` second — the whole reason this module has its own
  // fetch path. See the header.
  const message =
    problem?.detail?.trim() || problem?.title?.trim() || res.statusText || 'Scan failed'
  throw new ApiError(res.status, message)
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Turns a scan failure into a sentence worth showing — import.ts's rules. */
export function scanErrorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    for (const messages of Object.values(error.errors)) {
      if (messages?.[0]) return messages[0]
    }
    return "That doesn't look like a photo we can scan."
  }

  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.'
  }

  if (error.status === 429) {
    return "You've used today's AI allowance. It resets at midnight UTC."
  }

  return error.message || 'Something went wrong. Please try again.'
}
