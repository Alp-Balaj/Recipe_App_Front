// ─────────────────────────────────────────────────────────────────────────
// Recipe import — the wire calls behind "I already have a recipe" (stream L).
//
// NEW module, following the api/images.ts precedent rather than the
// api/generation.ts one, and the reason is worth stating because it is the
// only interesting thing about this file.
//
// The frozen `apiFetch` cannot serve either route. The photo route is
// multipart, and the wrapper JSON.stringifies every body and pins
// `Content-Type: application/json`. The URL route is JSON and would fit — but
// the wrapper's error path keeps only ProblemDetails `title` and DISCARDS
// `detail`, and for import the detail IS the message: "That page is too large
// to import", "No ingredients could be read from the source", "That address
// took too long to respond". Those are three different problems with three
// different fixes, and a user who sees only "That page could not be fetched"
// re-pastes a link that was never going to work.
//
// So both routes get a local fetch path here that keeps the wrapper's contract
// (/api prefix, any-2xx = success, typed errors) WITHOUT reshaping client.ts —
// exactly what images.ts did for the same class of reason.
//
// KAN-20 (cookie sessions): the bearer parameter is gone. The session rides on
// `httpOnly` cookies the browser attaches to a same-origin fetch by itself, so
// there is nothing for a caller to pass and nothing here to attach.
//
// What this module DOES have to do itself is the refresh-and-retry the frozen
// wrapper does for JSON calls: the access cookie expires every few minutes, and
// an upload that 401s because of that must not surface to the user as a failed
// upload. It calls the wrapper's exported `refreshSession()` so it joins the one
// in-flight refresh rather than starting a competing rotation.
//
// Wire contract (backend stream L):
//   POST /recipes/import/url    { url }
//   POST /recipes/import/photo  multipart/form-data, part name "file"
//     → 201 { recipe, source, budget? }
//     → 400 ValidationProblem keyed on `url` / `file`
//     → 422 the fetch worked; there was no recipe on the page
//     → 429 daily AI budget spent, or the `import` IP lane (10/min)
//     → 502 the page could not be fetched, or the extractor failed
//
// The result is an ORDINARY recipe — user-owned, and Private by decision D15 —
// so the UI routes to /recipes/{id} afterwards rather than inventing a preview
// surface, exactly as generation does.
// ─────────────────────────────────────────────────────────────────────────

import { ApiError, ApiUnauthorizedError, ApiValidationError, refreshSession } from './client'
import type { AiBudget, RecipeResponse, ValidationProblemResponse } from './types'

/** The backend's photo allowlist — ImageUploadRules, shared with POST /images. */
export const IMPORT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

/** The backend's size cap for an imported photo (5 MB), matching an upload's. */
export const IMPORT_PHOTO_MAX_BYTES = 5 * 1024 * 1024

/**
 * Where an imported recipe's content came from.
 *
 * Worth surfacing rather than hiding: `structuredData` is an exact read of the
 * site's own published data, while the two extraction paths are a model's
 * reading of prose or handwriting. The difference is why the UI nudges harder
 * toward checking an extracted result before making it public.
 */
export type RecipeImportSource = 'structuredData' | 'pageExtraction' | 'photoExtraction'

export interface ImportRecipeResponse {
  recipe: RecipeResponse
  source: RecipeImportSource
  /**
   * ABSENT when no model was called — the common outcome for a URL import, not
   * an edge case. A zeroed budget would read as "here is what this cost you",
   * which would be false.
   */
  budget?: AiBudget | null
}

export function importRecipeFromUrl(
  url: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ImportRecipeResponse> {
  return send('/api/recipes/import/url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: opts.signal,
    credentials: 'same-origin',
  })
}

export function importRecipeFromPhoto(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<ImportRecipeResponse> {
  const form = new FormData()
  form.append('file', file, file.name)

  // NOTE: no Content-Type header — the browser sets the multipart boundary, and
  // setting it by hand omits the boundary and produces a 400 nothing can explain.
  return send('/api/recipes/import/photo', {
    method: 'POST',
    body: form,
    signal: opts.signal,
    credentials: 'same-origin',
  })
}

async function send(path: string, init: RequestInit): Promise<ImportRecipeResponse> {
  let res = await fetch(path, init)
  if (res.status === 401 && (await refreshSession())) res = await fetch(path, init)

  if (res.ok) return (await res.json()) as ImportRecipeResponse

  if (res.status === 401) throw new ApiUnauthorizedError()

  const problem = (await safeJson(res)) as (ValidationProblemResponse & { detail?: string }) | null

  if (res.status === 400 && problem?.errors) {
    throw new ApiValidationError(problem.errors, problem.title ?? 'Validation failed')
  }

  // `detail` first, `title` second. This is the whole reason the module has its
  // own fetch path — see the header.
  const message =
    problem?.detail?.trim() || problem?.title?.trim() || res.statusText || 'Import failed'
  throw new ApiError(res.status, message)
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** True when the failure was "you are out of AI budget", not "the import broke". */
export function isQuotaError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429
}

/**
 * Turns an import failure into a sentence worth showing.
 *
 * The server's own words are preferred wherever it gave any, because every one
 * of them is about the URL or file the user just handed over and they are
 * written to be shown. The fallbacks only cover the case where a proxy or a
 * network error produced no ProblemDetails at all.
 */
export function importErrorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    for (const messages of Object.values(error.errors)) {
      if (messages?.[0]) return messages[0]
    }
    return "That doesn't look like something we can import."
  }

  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.'
  }

  if (error.status === 429) {
    return "You've used today's AI allowance. It resets at midnight UTC."
  }

  return error.message || 'Something went wrong. Please try again.'
}

/**
 * The host of a source URL, for display — "bbcgoodfood.com", not the whole
 * path. A leading "www." is dropped because it is noise nobody reads.
 *
 * Returns null for anything unparseable rather than echoing the raw string: a
 * malformed value would otherwise render as a meaningless blob of text exactly
 * where the reader expects a trustworthy attribution, which is worse than
 * showing nothing at all.
 */
export function sourceDomain(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, '') || null
  } catch {
    return null
  }
}
