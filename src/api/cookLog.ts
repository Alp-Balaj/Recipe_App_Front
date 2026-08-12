// ─────────────────────────────────────────────────────────────────────────
// The cook log — wire shapes + fetchers (plan-page redesign / roadmap spec 2).
//
// One row per cook EVENT, which is what /plan's "How did it go?" card and
// /plan/cooks read. Deliberately separate from the per-recipe cooked/rated
// endpoints in api/social.ts, because they answer a different question:
// CookedRecipe is a lifetime aggregate ("how many times, and how good") and
// cannot say WHEN, or what you thought that particular time.
//
// Wire contract (backend feat/plan-cook-log, verified 2026-08-10; the two DELETEs
// updated by KAN-18, 2026-08-12):
//   POST   /cook-log                      → 201 CookLogResponse | 404 (recipe/entry not yours)
//   GET    /cook-log                      → 200 CookLogListResponse   (?cursor&limit&recipeId)
//   GET    /cook-log/latest               → 200 CookLogLatestResponse (never 404)
//   PATCH  /cook-log/{id}                 → 200 CookLogResponse | 404
//   DELETE /cook-log/{id}                 → 200 UncookResponse | 404 (not the caller's, or gone)
//   DELETE /cook-log/entries/{entryId}    → 200 UncookResponse | 404 (entry not on your plans)
//
// cooked-per-plan-entry (backend Tasks 1–4, verified 2026-08-10): the entry DELETE
// removes EVERY cook row the caller logged against that plan slot in one call and
// steps TimesCooked down by the count deleted, floored at 0 — never negative. It is
// idempotent: un-cooking a slot with no rows still succeeds (with an empty list).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { CookedRecipeResponse } from './social'

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
 * A cook that already happened, being recorded after the fact (KAN-6).
 *
 * `cookedAt` is a DAY, not a moment — see `middayUtc`, which is the only
 * supported way to build it. The server keeps its date, stores the row at
 * midday UTC, and rejects a date in the future or from before the caller's
 * account existed with a 400 keyed on `cookedAt`.
 *
 * Omit it entirely and the cook is stamped "now", which is what every caller
 * before KAN-6 meant and still means.
 */
export interface PastCookFields {
  cookedAt?: string
  note?: string | null
}

/**
 * The chosen day as midday UTC — the ONE correct way to turn a `<input
 * type="date">` value into this endpoint's `cookedAt`.
 *
 * `new Date('2026-03-05').toISOString()` is midnight UTC, and
 * `new Date(2026, 2, 5).toISOString()` is midnight LOCAL expressed in UTC —
 * which is 2026-03-04T23:00Z for anyone east of Greenwich. Both hand the server
 * a date the user did not pick, in the direction that files last night's dinner
 * under the day before. Midday has twelve hours of clearance either way, so it
 * reads back on the chosen day for every offset from UTC-12 to UTC+11.
 *
 * Not for UTC+12 and east of it, where a locally-formatted render lands on the
 * following day — see ADR-0003 for why no stored hour fixes that (inhabited
 * offsets span 25 hours) and what actually would.
 *
 * Takes the `YYYY-MM-DD` string a date input produces, not a Date, because a
 * Date has already committed to a timezone and this function's whole job is to
 * not do that.
 */
export function middayUtc(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString()
}

/**
 * Logs a cook. Pass `mealPlanEntryId` when the gesture happened on a plan
 * surface — that link is what a later slice reads to decide which planned
 * meals are done, and it cannot be recovered afterwards.
 *
 * This also bumps the per-recipe cooked count server-side, so callers must NOT
 * additionally fire markCooked() from api/social.ts — that would count twice.
 *
 * `past` (KAN-6) records a cook that already happened. A backdated one does NOT
 * reorder Cooked: the server widens the dish's cooked range rather than stamping
 * it, so the dish keeps its place unless this cook really is its most recent.
 */
export function logCook(
  recipeId: string,
  mealPlanEntryId?: string | null,
  past?: PastCookFields,
): Promise<CookLogEntry> {
  return apiFetch<CookLogEntry>('/cook-log', {
    method: 'POST',
    body: {
      recipeId,
      mealPlanEntryId: mealPlanEntryId ?? null,
      // Spread, so a cook logged from cook mode or a plan slot sends the exact
      // body it sent before KAN-6. The server reads an omitted field and an
      // explicit null identically, but the surfaces that log a cook the ordinary
      // way have no business carrying "and no, this did not happen in the past"
      // on every request — nor their tests asserting it.
      ...(past?.cookedAt ? { cookedAt: past.cookedAt } : {}),
      ...(past?.note ? { note: past.note } : {}),
    },
  })
}

/**
 * What both un-log gestures answer with (KAN-18): the caller's row for every
 * recipe whose state the delete moved, in the SAME shape the cooked/rated
 * endpoints use — so one cache patcher serves all of them.
 *
 * `recipes` is EMPTY when nothing was written (the idempotent entry-scoped
 * repeat). That is not "no news": it is "no recipe changed", and a caller must
 * not patch anything on the strength of it.
 *
 * Why this is on the wire at all, rather than the client working the flag out
 * from a count it already has: since KAN-13 "cooked" means `timesCooked > 0`,
 * which is the SERVER's rule and has already changed once, and
 * `useSocialEnvelope`'s merge prefers a patch over a later read — so a
 * locally-derived flag would overwrite the server's answer and outlive the fetch
 * that should have healed it. Same argument as `CookedRecipeResponse.cookedByMe`,
 * and the backend's ADR-0006.
 */
export interface UncookResponse {
  recipes: CookedRecipeResponse[]
}

/**
 * Un-logs every cook the caller recorded against one plan slot, and steps the
 * per-recipe cooked count back down by that many.
 *
 * Idempotent — un-cooking a slot that was never cooked succeeds, with an empty
 * `recipes`. A 404 means the entry is not on one of your plans, which is a
 * different thing entirely.
 */
export function uncookEntry(mealPlanEntryId: string): Promise<UncookResponse> {
  return apiFetch<UncookResponse>(`/cook-log/entries/${mealPlanEntryId}`, { method: 'DELETE' })
}

/**
 * Un-logs ONE cook and steps the dish's cooked count back down by one (KAN-14).
 *
 * The row-scoped counterpart of `uncookEntry`. That one can only name a cook
 * that satisfied a plan slot, so a cook logged from cook mode on an unplanned
 * recipe had no undo: the only gesture wide enough to reach it was
 * `clearCooked` — "I have never cooked this" — which erases every cook of the
 * dish and every note on them, and no surface calls it any more (KAN-12).
 *
 * NOT idempotent, unlike `uncookEntry`, and the difference is the scope. An
 * entry outlives its cooks, so "no cooks against this slot" is a state it can
 * still be in; a row does not outlive its own deletion, so a second call is a
 * 404. Callers must therefore not fire this twice for one gesture — disable the
 * control while it is in flight rather than relying on a forgiving server.
 *
 * The note on the cook goes with it, which is why the surface offering this must
 * confirm first when there is one (KAN-8).
 *
 * The reply names exactly one recipe — this dish — and is the only way the caller
 * learns that removing its LAST cook turned "you cooked this" off (KAN-18).
 */
export function unlogCook(id: string): Promise<UncookResponse> {
  return apiFetch<UncookResponse>(`/cook-log/${id}`, { method: 'DELETE' })
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
