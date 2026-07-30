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
//   GET    /meal-plans/{id}/grocery-insight  → 200 GroceryInsight | 404
// All list endpoints: ?cursor&limit (default 20, cap 50, <=0 → 400).
//
// week/shopping rework (2026-07-29 design), Tasks 4–5: the shopping half of this
// module is GONE. `POST /meal-plans/{id}/generate-shopping-list` no longer exists
// — the list is a per-request PROJECTION now, so there is nothing to generate —
// and the /shopping-list row endpoints moved to api/shopping.ts along with their
// wire shapes. `weekStartOf` stays here: it is plan-week arithmetic that both
// surfaces share, and both APIs 400 on anything but a UTC-midnight Monday.
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
  /**
   * Prep + cook for this dish. REQUIRED — the server always sends it, same as
   * MealPlanSummary.totalMinutes. This is what makes a per-DAY cook load free:
   * the week summary's totalMinutes can't be broken down by day.
   */
  totalTimeMinutes: number
  /**
   * Nullable, and it matters: a recipe without a calorie figure must stay
   * visibly uncounted rather than contributing a zero. Shaped like
   * RecipeResponse.caloriesPerServing, which is the same wire field.
   */
  caloriesPerServing?: number | null
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

/**
 * The dish carrying the most ingredients nothing else in the week uses — the one
 * whose removal shortens the shop most. Null when the week has no plan, no
 * entries, or no dish with any unique ingredient at all.
 */
export interface GroceryOutlier {
  recipeId: string
  title: string
  uniqueIngredientCount: number
}

/**
 * What a week's plan costs at the shop, in ingredients rather than money:
 * how many distinct things it needs, how many of those more than one dish wants
 * (the overlap that makes a week cheap to shop for), and the outlier.
 */
export interface GroceryInsight {
  distinctIngredientCount: number
  sharedIngredientCount: number
  outlier?: GroceryOutlier | null
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

// ── AI week proposal (stream C, D2 = propose-then-accept) ───────────────────

/** One proposed (day, meal) assignment. Same recipe summary shape as a planned entry. */
export interface ProposedSlot {
  dayOfWeek: DayName
  mealType: MealTypeName
  recipe: MealPlanEntryRecipeSummary
}

/**
 * The assistant's proposal for a week. READ-ONLY on the server: nothing is
 * written until the user accepts slots, and each accepted slot goes through the
 * ordinary POST /meal-plans/{id}/entries — which is why collisions surface as
 * per-slot 409s here in the client, never inside the proposal. Slots covers only
 * OPEN (day, meal) positions; existing entries are never proposed over. Empty is
 * a valid proposal: a full week, or nothing to ground on.
 */
export interface WeekProposal {
  weekStartDate: string
  slots: ProposedSlot[]
}

/**
 * POST /meal-plans/propose-week → 200. Costs a real LLM call (rides the chat
 * rate lane); a 502 means the assistant failed and nothing was changed — safe
 * to retry. 400 on a weekStartDate that isn't a UTC-midnight Monday.
 */
export function proposeWeek(weekStartDate: string): Promise<WeekProposal> {
  return apiFetch<WeekProposal>('/meal-plans/propose-week', { method: 'POST', body: { weekStartDate } })
}

// ── Grocery insight ─────────────────────────────────────────────────────────

/**
 * GET /meal-plans/{id}/grocery-insight → 200. Read-only, computed from the plan's
 * entries' structured ingredients on the same normalised key the shopping-list
 * projection groups on, so the two surfaces can never disagree about what "one
 * ingredient" means.
 */
export function getGroceryInsight(planId: string, signal?: AbortSignal): Promise<GroceryInsight> {
  return apiFetch<GroceryInsight>(`/meal-plans/${planId}/grocery-insight`, { signal })
}
