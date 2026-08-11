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
//   GET    /cook-log                      → 200 CookLogListResponse   (?cursor&limit)
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
 * Un-logs every cook the caller recorded against one plan slot, and steps the
 * per-recipe cooked count back down by that many.
 *
 * Idempotent — un-cooking a slot that was never cooked succeeds. A 404 means the
 * entry is not on one of your plans, which is a different thing entirely.
 */
export function uncookEntry(mealPlanEntryId: string): Promise<void> {
  return apiFetch<void>(`/cook-log/entries/${mealPlanEntryId}`, { method: 'DELETE' })
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
