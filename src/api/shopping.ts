// ─────────────────────────────────────────────────────────────────────────
// Shopping-list API — wire shapes + fetchers (week/shopping rework, Task 5).
//
// NEW module, following the api/social.ts and api/mealPlans.ts precedent:
// shopping-only wire shapes live here, 1:1 with the backend DTOs (camelCase;
// Guids/DateTimes as strings; enums as their string names via the global
// JsonStringEnumConverter).
//
// The list is a PROJECTION, not a table. Every GET recomputes it from the
// week's plan entries, the week's manual rows, and a mark overlay keyed
// (UserId, WeekStartDate, IngredientKey) — which is the whole point: a tick
// survives any later edit to the plan, because the tick was never attached to
// a generated row that regeneration could throw away.
//
// Wire contract (backend Tasks 3/4, verified against the shipped DTOs 2026-07-29):
//   GET    /shopping-list?weekStart={iso}&scope=Week|All → 200 ShoppingList
//            scope=Week REQUIRES weekStart (omitting it is a 400).
//            scope=All IGNORES weekStart and returns the current week plus every
//            other week still holding an unticked, unsuppressed group —
//            current-week-first, then week-descending.
//   POST   /shopping-list                → 201 ShoppingListItemResponse + Location
//   PUT    /shopping-list/marks          → 204   (explicit full set of BOTH flags)
//   DELETE /shopping-list/{id}           → 204 | 404   (manual rows only)
//
// Two rules this module's callers must respect, both enforced server-side:
//  · `weekStart` must be a UTC-MIDNIGHT MONDAY or the API answers 400. Use
//    `weekStartOf()` from ./mealPlans — never hand-build the date.
//  · `isSuppressed: true` on a `manual:`-prefixed key is a 400. Manual items are
//    DELETEd for real; only a Derived group can be hidden. Read `origin` to pick
//    the verb, never the key's shape.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { UnitOfMeasure } from '@/api/types'

/** ShoppingListScope — which weeks the projection covers. */
export type ShoppingScope = 'Week' | 'All'

/**
 * ShoppingListGroupOrigin. `Derived` groups come from the week's plan entries and
 * are hidden by a suppression mark; `Manual` groups are real rows and are deleted.
 */
export type ShoppingGroupOrigin = 'Derived' | 'Manual'

/**
 * One dish's contribution to a group. `quantity` is a PRE-RENDERED display string
 * ("2.5 cups"), in the unit that dish's recipe was WRITTEN in. Still do not parse
 * or add these — stream G made the server able to sum, and `ShoppingGroup.totals`
 * is where the sum arrives already done.
 */
export interface ShoppingPart {
  quantity: string
  dishTitle: string
  /**
   * The date this dish is planned for, ISO. Null on a manual row, which serves no
   * planned dish. Parts arrive in (date, meal) order, so `parts[0]` is the dish the
   * row is filed under — the shop redesign's buy-once rule, decided server-side.
   */
  date?: string | null
  /**
   * Deliberately a plain string, not `MealTypeName`: that union is the three slots the
   * planner OFFERS, while the server's MealType enum is wider — an older entry can come
   * back as a meal this client never writes, and narrowing here would be a lie the
   * compiler enforces.
   */
  meal?: string | null
}

/**
 * A summed quantity within one group (stream G, slice G1).
 *
 * A group carries one total per summation BUCKET, and more than one is normal:
 * everything mass-dimensioned collapses into a single figure and everything
 * volume-dimensioned into another, each count unit forms its own, and imprecise
 * parts (a pinch, a dash) produce none at all — so a group of nothing but
 * seasoning has an empty `totals` and shows only its parts.
 *
 * `display` is server-rendered and is what the UI shows; `quantity` and `unit`
 * are there for anything that needs the number itself. Two totals on one group
 * means it was measured by both weight and volume, which cannot be collapsed
 * without the ingredient's density — that lands in slice G3.
 */
export interface ShoppingTotal {
  quantity: number
  unit: UnitOfMeasure
  display: string
}

/**
 * One shopping-list line: an ingredient, the amounts each dish wants of it, and
 * the dishes themselves. `manualItemId` is set only when `origin` is 'Manual' —
 * it is the row DELETE /shopping-list/{id} targets.
 *
 * A manual group has `origin: 'Manual'`, `dishes: []`, and a single part whose
 * `dishTitle` is "Added by you".
 */
export interface ShoppingGroup {
  key: string
  displayName: string
  parts: ShoppingPart[]
  dishes: string[]
  isPurchased: boolean
  origin: ShoppingGroupOrigin
  manualItemId?: string | null
  /** Always empty for a Manual group — its quantity is free text, not a measurement. */
  totals: ShoppingTotal[]
  /**
   * The shop aisle this line is shelved in — the redesigned list's heading, so it is never
   * empty: an unresolved name or a manual row answers "Other". Groups arrive already sorted
   * into walk order (produce first, "Other" last), which is why the page groups them in
   * ENCOUNTER order and never re-sorts alphabetically.
   */
  aisle: string
}

/** One week of the projection, with its own progress denominator. */
export interface ShoppingWeek {
  weekStartDate: string
  groups: ShoppingGroup[]
  purchasedCount: number
  totalCount: number
}

/**
 * `orphanedPurchasedNames` carries display names for ticks whose group no longer
 * exists — the "something you'd already bought left your plan" notice. It is a
 * banner, never ghost rows: the item isn't on the list any more, you just want
 * to know it went.
 */
export interface ShoppingList {
  weeks: ShoppingWeek[]
  orphanedPurchasedNames: string[]
}

/** The row POST /shopping-list answers with (manual adds only). */
export interface ShoppingListItemResponse {
  id: string
  ingredient: string
  quantity: string
  isPurchased: boolean
  createdAt: string
  mealPlanId?: string | null
}

/**
 * GET /shopping-list. Pass `weekStart` (a UTC-midnight Monday) with scope 'Week';
 * with scope 'All' it is ignored, so pass null and let the server choose the weeks.
 */
export function getShoppingList(params: {
  weekStart?: string | null
  scope: ShoppingScope
  signal?: AbortSignal
}): Promise<ShoppingList> {
  const { weekStart, scope, signal } = params
  return apiFetch<ShoppingList>('/shopping-list', { query: { weekStart, scope }, signal })
}

/** POST /shopping-list → 201. Manual items are scoped to a week now, like everything else. */
export function addManualItem(item: {
  ingredient: string
  quantity: string
  weekStartDate: string
}): Promise<ShoppingListItemResponse> {
  return apiFetch<ShoppingListItemResponse>('/shopping-list', { method: 'POST', body: item })
}

/** DELETE /shopping-list/{id} → 204. Manual rows only — a Derived group is suppressed instead. */
export function deleteManualItem(id: string): Promise<void> {
  return apiFetch<void>(`/shopping-list/${id}`, { method: 'DELETE' })
}

/**
 * PUT /shopping-list/marks → 204. Both flags are always sent in full: an explicit
 * set is idempotent by construction, so a double-tap (or a retried offline tick)
 * cannot land the overlay somewhere the user didn't ask for.
 */
export function setMark(mark: {
  weekStartDate: string
  key: string
  isPurchased: boolean
  isSuppressed: boolean
}): Promise<void> {
  return apiFetch<void>('/shopping-list/marks', { method: 'PUT', body: mark })
}
