// ─────────────────────────────────────────────────────────────────────────
// Image upload API — social-feed cp07, consuming the backend cp04 endpoint.
//
// NEW module (not one of the frozen shared modules), following the
// `chat.ts`/`social.ts` precedent. The frozen `apiFetch` is JSON-shaped —
// it JSON.stringifies every body and pins `Content-Type: application/json` —
// so the multipart POST /images gets its own fetch path here that keeps the
// wrapper's contract (/api prefix, bearer, any-2xx = success, typed errors)
// WITHOUT reshaping `client.ts`.
//
// Wire contract (backend cp04, verified live 2026-07-18):
//   POST /images  multipart/form-data, part name "file"
//     → 201 { url }   url is RELATIVE (`/images/<guid32>.<ext>`) — render it
//                     through resolveImageUrl (src/lib/images.ts)
//     → 400 ValidationProblem keyed on `file` (type/size/magic-byte/no-file;
//           allowlist jpeg|png|webp, 5 MB cap, magic bytes sniffed)
//     → 401 (no/expired session) | 429 (own `images` rate lane, 20/min)
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
// ─────────────────────────────────────────────────────────────────────────

import { ApiError, ApiUnauthorizedError, ApiValidationError, refreshSession } from './client'
import type { ValidationProblemResponse } from './types'

/** The backend's content-type allowlist (cp04 ImageUploadRules). */
export const IMAGE_ALLOWED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

/** `accept` attribute value for the file input. */
export const IMAGE_ACCEPT = IMAGE_ALLOWED_TYPES.join(',')

/** The backend's upload size cap (5 MB). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** POST /images → 201 body. `url` is RELATIVE — resolve before rendering. */
export interface ImageUploadResponse {
  url: string
}

/**
 * Upload one image via multipart POST /images (part name `file`). Resolves
 * with the 201 body; throws the wrapper's typed errors otherwise
 * (ApiValidationError on 400, ApiUnauthorizedError on 401, ApiError else —
 * a 429 from the `images` rate lane arrives as ApiError with status 429).
 */
export async function uploadImage(
  file: File,
  opts: { signal?: AbortSignal } = {},
): Promise<ImageUploadResponse> {
  const { signal } = opts

  const form = new FormData()
  form.append('file', file, file.name)

  // NOTE: no Content-Type header — the browser sets the multipart boundary.
  const send = () =>
    fetch('/api/images', { method: 'POST', body: form, signal, credentials: 'same-origin' })

  let res = await send()
  if (res.status === 401 && (await refreshSession())) res = await send()

  if (res.ok) return (await res.json()) as ImageUploadResponse

  if (res.status === 400) {
    const problem = (await safeJson(res)) as ValidationProblemResponse | null
    if (problem?.errors) {
      throw new ApiValidationError(problem.errors, problem.title ?? 'Validation failed')
    }
    throw new ApiError(400, problem?.title ?? 'Bad request')
  }

  if (res.status === 401) throw new ApiUnauthorizedError()

  const data = await safeJson(res)
  const message =
    (data && (data.title || data.error || data.message)) || res.statusText || 'Upload failed'
  throw new ApiError(res.status, message)
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}
