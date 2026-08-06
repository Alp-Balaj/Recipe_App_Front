// ─────────────────────────────────────────────────────────────────────────
// Computed nutrition for a plan (stream I — D12's second surface).
//
// NEW module rather than an addition to api/mealPlans.ts, following the
// api/shopping.ts precedent: this is a different question about the same
// plan, and it costs a catalogue read that the planner, the picker and the
// week board all get on with fine without.
//
// Wire contract:
//   GET /meal-plans/{id}/nutrition → 200 MealPlanNutrition | 404
//
// ONE read for the whole week, deliberately. The obvious alternative is
// /recipes/{id}/insights per planned entry — up to 21 requests to draw one
// day — which is the N-per-view mistake the month view already refused twice.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { DayName } from './mealPlans'

/**
 * One planned day's computed nutrition.
 *
 * Every figure is ONE SERVING PER PLANNED MEAL — the same rule DayTotals uses
 * for the author-typed calorie strip, which is what makes the two comparable
 * rather than merely adjacent. A dish planned twice in a day counts twice.
 *
 * Every figure is also nullable, and null means "not known", never zero: a day
 * whose dishes are all unresolvable free text has no calorie figure, and
 * rendering it as 0 would say something false about the food.
 */
export interface DayNutrition {
  dayOfWeek: DayName
  /** Planned meals counted into this day (entries, not distinct dishes). */
  entryCount: number
  kcal?: number | null
  proteinG?: number | null
  fatG?: number | null
  carbsG?: number | null
  fibreG?: number | null
  /** Ingredient lines that resolved AND converted to grams, summed over the day's meals. */
  coveredLines: number
  /** Ingredient lines the day has in total. The denominator, never optional. */
  totalLines: number
  /**
   * D12's trust floor, decided server-side so every surface agrees: false means
   * render the day as INCOMPLETE, not as a number. An undercounted calorie
   * figure is worse than none — it looks like a light day rather than a
   * half-read one.
   */
  isSufficientlyCovered: boolean
}

/** Days with no entries are omitted, not returned as zeroes. */
export interface MealPlanNutrition {
  mealPlanId: string
  days: DayNutrition[]
}

/** GET /meal-plans/{id}/nutrition → 200. Read-only; computed from the catalogue. */
export function getMealPlanNutrition(planId: string, signal?: AbortSignal): Promise<MealPlanNutrition> {
  return apiFetch<MealPlanNutrition>(`/meal-plans/${planId}/nutrition`, { signal })
}
