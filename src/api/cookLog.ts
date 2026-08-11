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
//   POST   /cook-log                      → 201 CookLogResponse | 404 (recipe/entry not yours)
//   GET    /cook-log                      → 200 CookLogListResponse   (?cursor&limit&recipeId)
//   GET    /cook-log/latest               → 200 CookLogLatestResponse (never 404)
//   PATCH  /cook-log/{id}                 → 200 CookLogResponse | 404
//   DELETE /cook-log/entries/{entryId}    → 204 | 404 (entry not on one of the caller's plans)
//
// cooked-per-plan-entry (backend Tasks 1–4, verified 2026-08-10): the DELETE above
// removes EVERY cook row the caller logged against that plan slot in one call and
// steps TimesCooked down by the count deleted, floored at 0 — never negative. It is
// idempotent: un-cooking a slot with no rows still answers 204.
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
  /** Null when the recipe has no photo, and also once it is unavailable. */
  recipeImageUrl?: string | null
  /** The plan slot this cook satisfied; null for an ad-hoc cook. */
  mealPlanEntryId?: string | null
  cookedAt: string
  note?: string | null
  /**
   * "Can I open this recipe?" — NOT "does it still exist". False both when the
   * author removed it and when they stopped sharing it with this reader
   * (backend KAN-2). The row still renders from `recipeTitle` and its note
   * stays editable; the client must not offer to open or re-cook it.
   *
   * There is deliberately no second field naming WHICH cause, and the client
   * must not try to infer one: saying "deleted" about a recipe the author
   * merely made private reports that author's visibility decision to a
   * stranger. Copy says "unavailable" and stops there.
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

/**
 * Un-logs every cook the caller recorded against one plan slot, and steps the
 * per-recipe cooked count back down by that many.
 *
 * Idempotent — un-cooking a slot that was never cooked succeeds. A 404 means the
 * entry is not on one of your plans, which is a different thing entirely.
 */
export function uncookEntry(mealPlanEntryId: string): Promise<void> {
  return apiFetch<void>(`/cook-log/entries/${mealPlanEntryId}`, { method: 'DELETE' })
}

/**
 * One page of the caller's cooks, newest first.
 *
 * `recipeId` (KAN-5) narrows it to a single dish — what /cooked/:recipeId pages
 * — through the same (cookedAt, id) cursor. Omitting it means EVERY dish, and
 * the filter narrows the CALLER's log rather than widening it to the recipe's:
 * another user's cooks of the same recipe, and their notes, are never in scope.
 */
export function getCookLog(
  params: { cursor?: string; limit?: number; recipeId?: string; signal?: AbortSignal } = {},
): Promise<CookLogListResponse> {
  const { cursor, limit, recipeId, signal } = params
  return apiFetch<CookLogListResponse>('/cook-log', { query: { cursor, limit, recipeId }, signal })
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
