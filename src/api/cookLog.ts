// ─────────────────────────────────────────────────────────────────────────
// The cook log — wire shapes + fetchers (plan-page redesign / roadmap spec 2).
//
// One row per cook EVENT, which is what /plan's "How did it go?" card and
// /plan/cooks read. Deliberately separate from the per-recipe cooked/rated
// endpoints in api/social.ts, because they answer a different question:
// CookedRecipe is a lifetime aggregate ("how many times, and how good") and
// cannot say WHEN, or what you thought that particular time.
//
// Wire contract (backend feat/plan-cook-log, verified 2026-08-10):
//   POST   /cook-log            → 201 CookLogResponse | 404 (recipe/entry not yours)
//   GET    /cook-log            → 200 CookLogListResponse   (?cursor&limit)
//   GET    /cook-log/latest     → 200 CookLogLatestResponse (never 404)
//   PATCH  /cook-log/{id}       → 200 CookLogResponse | 404
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

export interface CookLogEntry {
  id: string
  recipeId: string
  /**
   * The dish's title as it read when the cook was logged — a SNAPSHOT, not a
   * join. It is what keeps a cook readable after its recipe is soft-deleted.
   */
  recipeTitle: string
  /** Null when the recipe has no photo, and also once it is gone. */
  recipeImageUrl?: string | null
  /** The plan slot this cook satisfied; null for an ad-hoc cook. */
  mealPlanEntryId?: string | null
  cookedAt: string
  note?: string | null
  /**
   * False once the recipe no longer exists. The row still renders; the client
   * must not offer to open or re-cook a dish that is gone.
   */
  recipeAvailable: boolean
}

export interface CookLogListResponse {
  items: CookLogEntry[]
  nextCursor?: string | null
}

/**
 * The whole "How did it go?" card in one request: the row to render, and the
 * total its "All N cooks ›" link needs.
 *
 * `latest` is null on an empty log — a 200, never a 404. That is what lets the
 * card tell "you have not cooked anything yet" apart from "still loading",
 * which is the cold-start trap MealPlanWeekPage documents at length.
 */
export interface CookLogLatest {
  latest?: CookLogEntry | null
  totalCount: number
}

/**
 * Logs a cook. Pass `mealPlanEntryId` when the gesture happened on a plan
 * surface — that link is what a later slice reads to decide which planned
 * meals are done, and it cannot be recovered afterwards.
 *
 * This also bumps the per-recipe cooked count server-side, so callers must NOT
 * additionally fire markCooked() from api/social.ts — that would count twice.
 */
export function logCook(recipeId: string, mealPlanEntryId?: string | null): Promise<CookLogEntry> {
  return apiFetch<CookLogEntry>('/cook-log', {
    method: 'POST',
    body: { recipeId, mealPlanEntryId: mealPlanEntryId ?? null },
  })
}

export function getCookLog(params: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<CookLogListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<CookLogListResponse>('/cook-log', { query: { cursor, limit }, signal })
}

export function getLatestCook(signal?: AbortSignal): Promise<CookLogLatest> {
  return apiFetch<CookLogLatest>('/cook-log/latest', { signal })
}

/**
 * Sets or clears the note on one logged cook.
 *
 * Increments NOTHING — annotating a cook you already did is not cooking again.
 * If this ever appears to change a cooked count, the bug is server-side.
 */
export function updateCookNote(id: string, note: string | null): Promise<CookLogEntry> {
  return apiFetch<CookLogEntry>(`/cook-log/${id}`, { method: 'PATCH', body: { note } })
}
