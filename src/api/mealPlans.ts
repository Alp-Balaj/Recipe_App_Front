// ─────────────────────────────────────────────────────────────────────────
// Meal-planning API — wire shapes + fetchers (meal-planning-ui plan).
//
// NEW module, following the api/social.ts precedent: plan-only wire shapes
// live here, 1:1 with the backend DTOs (camelCase; Guids/DateTimes as
// strings; enums as their string names via the global JsonStringEnumConverter).
//
// Wire contract (backend cp02–04 verified 2026-07-19, plus Task 1 of this plan):
//   GET    /meal-plans                       → 200 MealPlanListResponse   (Task 1)
//   POST   /meal-plans                       → 201 MealPlan | 409 (week exists)
//   GET    /meal-plans/{id}                  → 200 MealPlan | 404
//   POST   /meal-plans/{id}/entries          → 201 MealPlanEntry | 409 (slot taken) | 404
//   DELETE /meal-plans/{id}/entries/{entryId}→ 204 | 404
//   POST   /meal-plans/{id}/generate-shopping-list → 200 ShoppingListItem[] | 404
//   GET    /shopping-list                    → 200 ShoppingListResponse
//   POST   /shopping-list                    → 201 ShoppingListItem
//   PATCH  /shopping-list/{id}               → 204 | 404   (explicit set, idempotent)
//   DELETE /shopping-list/{id}               → 204 | 404
// All list endpoints: ?cursor&limit (default 20, cap 50, <=0 → 400).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

/** DayOfWeek crosses the wire as its .NET name. */
export type DayName =
  | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

/** MealType crosses the wire as its .NET name. */
export type MealTypeName = 'Breakfast' | 'Lunch' | 'Dinner'

/** Render order for the grid — Monday-first, matching WeekStartDate semantics. */
export const DAY_ORDER: readonly DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]

export const MEAL_ORDER: readonly MealTypeName[] = ['Breakfast', 'Lunch', 'Dinner']

export interface MealPlanEntryRecipeSummary {
  id: string
  title: string
  imageUrl?: string | null
}

export interface MealPlanEntry {
  id: string
  dayOfWeek: DayName
  mealType: MealTypeName
  recipe: MealPlanEntryRecipeSummary
}

export interface MealPlan {
  id: string
  weekStartDate: string
  createdAt: string
  entries: MealPlanEntry[]
}

export interface MealPlanSummary {
  id: string
  weekStartDate: string
  createdAt: string
  /**
   * Both counters are computed server-side over entries whose recipe still
   * exists, so they agree with GET /meal-plans/{id} — which drops entries whose
   * recipe was soft-deleted. `entryCount` can therefore be lower than the number
   * of slots the user filled, and that is correct: the missing dish is gone.
   */
  entryCount: number
  /** Prep + cook summed across the week's entries, per entry (a dish planned twice costs twice). */
  totalMinutes: number
}

export interface MealPlanListResponse {
  items: MealPlanSummary[]
  nextCursor?: string | null
}

export interface ShoppingListItem {
  id: string
  ingredient: string
  quantity: string
  isPurchased: boolean
  createdAt: string
  mealPlanId?: string | null
}

export interface ShoppingListResponse {
  items: ShoppingListItem[]
  nextCursor?: string | null
}

/**
 * The UTC-midnight Monday of the week containing `date`, as an ISO string —
 * the exact shape POST /meal-plans and ?weekStart= both require (a non-midnight
 * or non-UTC value is a 400 on both).
 */
export function weekStartOf(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  // getUTCDay(): 0 = Sunday. Monday-first means Sunday is 6 days into the week.
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday)
  return utc.toISOString()
}

// ── Plans ───────────────────────────────────────────────────────────────────

/** GET /meal-plans — one keyset page of the caller's weeks, newest first. */
export function getMealPlans(params: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<MealPlanListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<MealPlanListResponse>('/meal-plans', { query: { cursor, limit }, signal })
}

/**
 * The caller's plan for one exact week, or null if they have none. This is the
 * SPA's entry point: POST /meal-plans 409s on a duplicate week WITHOUT returning
 * the existing id, so the id can only be discovered by querying.
 */
export async function getMealPlanForWeek(weekStart: string, signal?: AbortSignal): Promise<MealPlanSummary | null> {
  const page = await apiFetch<MealPlanListResponse>('/meal-plans', {
    query: { weekStart, limit: 1 },
    signal,
  })
  return page.items[0] ?? null
}

/** GET /meal-plans/{id} — the full week view. Entries with soft-deleted recipes are omitted server-side. */
export function getMealPlan(id: string, signal?: AbortSignal): Promise<MealPlan> {
  return apiFetch<MealPlan>(`/meal-plans/${id}`, { signal })
}

/** POST /meal-plans → 201. Throws ApiConflictError (409) if the week already has a plan. */
export function createMealPlan(weekStartDate: string): Promise<MealPlan> {
  return apiFetch<MealPlan>('/meal-plans', { method: 'POST', body: { weekStartDate } })
}

/** POST /meal-plans/{id}/entries → 201. Throws ApiConflictError (409) if the slot is occupied. */
export function addMealPlanEntry(
  planId: string,
  entry: { dayOfWeek: DayName; mealType: MealTypeName; recipeId: string },
): Promise<MealPlanEntry> {
  return apiFetch<MealPlanEntry>(`/meal-plans/${planId}/entries`, { method: 'POST', body: entry })
}

/** DELETE /meal-plans/{id}/entries/{entryId} → 204. */
export function removeMealPlanEntry(planId: string, entryId: string): Promise<void> {
  return apiFetch<void>(`/meal-plans/${planId}/entries/${entryId}`, { method: 'DELETE' })
}

/**
 * POST /meal-plans/{id}/generate-shopping-list → 200 with the fresh items (a bare
 * array, no paging). REPLACES this plan's generated rows — purchased ticks on them
 * are lost (meal-planning-v1-semantics #5). Manual items are never touched.
 */
export function generateShoppingList(planId: string): Promise<ShoppingListItem[]> {
  return apiFetch<ShoppingListItem[]>(`/meal-plans/${planId}/generate-shopping-list`, { method: 'POST' })
}

// ── Shopping list ───────────────────────────────────────────────────────────

/** GET /shopping-list — one keyset page, CreatedAt DESC. Single per-user list. */
export function getShoppingListPage(params: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<ShoppingListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<ShoppingListResponse>('/shopping-list', { query: { cursor, limit }, signal })
}

/** POST /shopping-list → 201. Manual items always have mealPlanId null. */
export function addShoppingListItem(item: { ingredient: string; quantity: string }): Promise<ShoppingListItem> {
  return apiFetch<ShoppingListItem>('/shopping-list', { method: 'POST', body: item })
}

/** PATCH /shopping-list/{id} → 204. Explicit set, not a toggle — idempotent by construction. */
export function setShoppingListItemPurchased(id: string, isPurchased: boolean): Promise<void> {
  return apiFetch<void>(`/shopping-list/${id}`, { method: 'PATCH', body: { isPurchased } })
}

/** DELETE /shopping-list/{id} → 204. */
export function deleteShoppingListItem(id: string): Promise<void> {
  return apiFetch<void>(`/shopping-list/${id}`, { method: 'DELETE' })
}
