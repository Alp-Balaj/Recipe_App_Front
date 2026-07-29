// ─────────────────────────────────────────────────────────────────────────
// Things the month grid can work out about itself (meal-plan insights).
//
// Pure functions over week summaries the page already holds — no fetching, no
// hooks. Everything here is arithmetic on data useMonthPlans resolved for the
// grid, which is what makes these the cheapest cards on the surface: they cost
// nothing but the loop.
//
// Deliberately typed against a MINIMAL week shape rather than importing
// WeekSummary from the hook: lib/ should not depend on hooks/, and the hook's
// type is structurally compatible anyway.
// ─────────────────────────────────────────────────────────────────────────

import type { MealPlanEntry } from '@/api/mealPlans'
import { addDays, dayNameOf, formatPlanDate, parsePlanDate } from './planDates'

export interface PlannedWeek {
  weekStart: string
  entries: MealPlanEntry[]
}

/** "2026-08-05" → the recipe ids planned that day, across all three meals. */
export function dishesByDate(
  weeks: Date[][],
  byWeek: Map<string, PlannedWeek>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()

  for (const week of weeks) {
    const summary = byWeek.get(formatPlanDate(week[0]))
    if (!summary) continue

    for (const date of week) {
      const day = dayNameOf(date)
      const ids = summary.entries
        .filter((entry) => entry.dayOfWeek === day)
        .map((entry) => entry.recipe.id)
      if (ids.length > 0) out.set(formatPlanDate(date), new Set(ids))
    }
  }

  return out
}

/**
 * Every (date, recipe) pair where that same dish was also planned the day
 * BEFORE — keyed "2026-08-06|recipe-id" for O(1) lookup while rendering.
 *
 * Matched on recipe id, not title: two different recipes both called "Pasta"
 * are not the same dinner twice.
 *
 * The mark belongs to the SECOND day, which is why this is one flat set rather
 * than a set of pairs — a pair has no home in a month grid when its two halves
 * land on different rows. Sunday→Monday is not an edge case here; cook a big
 * thing on Sunday and finish it Monday is the most common repeat there is, and
 * it always straddles a row boundary.
 *
 * The grid's very first day has no visible predecessor, so a dish carried in
 * from the day before the grid goes unmarked. That is the one silent miss, and
 * it is silent in the right direction: it under-claims rather than inventing.
 */
export function repeatedFromYesterday(
  weeks: Date[][],
  byWeek: Map<string, PlannedWeek>,
): Set<string> {
  const byDate = dishesByDate(weeks, byWeek)
  const out = new Set<string>()

  for (const [dateKey, ids] of byDate) {
    const date = parsePlanDate(dateKey)
    if (!date) continue
    const before = byDate.get(formatPlanDate(addDays(date, -1)))
    if (!before) continue

    for (const id of ids) {
      if (before.has(id)) out.add(`${dateKey}|${id}`)
    }
  }

  return out
}

export interface DayLoad {
  /** Prep + cook summed across the day's planned meals. Never partial — the
   *  field is required on every entry, so this is complete or the day is empty. */
  minutes: number
  /** Summed over planned meals that HAVE a figure. Read it through dayCalories. */
  calories: number
  planned: number
  counted: number
}

/**
 * What each day of the grid costs, from the entries themselves.
 *
 * Free since the entry's recipe summary started carrying totalTimeMinutes and
 * caloriesPerServing — before that this needed a GET /recipes/{id} per distinct
 * dish, which is why the month shipped with neither.
 */
export function dayLoads(weeks: Date[][], byWeek: Map<string, PlannedWeek>): Map<string, DayLoad> {
  const out = new Map<string, DayLoad>()

  for (const week of weeks) {
    const summary = byWeek.get(formatPlanDate(week[0]))
    if (!summary) continue

    for (const date of week) {
      const day = dayNameOf(date)
      const entries = summary.entries.filter((entry) => entry.dayOfWeek === day)
      if (entries.length === 0) continue

      let minutes = 0
      let calories = 0
      let counted = 0
      for (const entry of entries) {
        minutes += entry.recipe.totalTimeMinutes
        const kcal = entry.recipe.caloriesPerServing
        if (kcal != null) {
          calories += kcal
          counted++
        }
      }

      out.set(formatPlanDate(date), { minutes, calories, planned: entries.length, counted })
    }
  }

  return out
}

/**
 * A day's calorie total, or null when it cannot be stated honestly — either
 * nothing is planned, or something planned has no figure.
 *
 * A partly-counted day is deliberately NOT reported as a smaller number. On a
 * chart a short bar means "a light day", and a day whose lunch simply has no
 * calorie figure is not a light day.
 */
export function dayCalories(load: DayLoad | undefined): number | null {
  if (!load || load.planned === 0) return null
  return load.counted < load.planned ? null : load.calories
}

export interface DinnerGap {
  /** Days in the window with no dinner planned. */
  open: number
  /** How many days the window actually covers — see the clamp below. */
  horizonDays: number
  /** The earliest day with an open dinner, or null when there are none. */
  first: Date | null
}

/** The window the gap card looks ahead over, when the grid allows it. */
const HORIZON_DAYS = 7

/**
 * Open DINNER slots over the next week — the prompt that turns the header from
 * a score into a task.
 *
 * Dinner only, on purpose: it is the meal people actually plan, and counting
 * all 21 weekly slots would report a perfectly-planned dinner month as two
 * thirds empty.
 *
 * CLAMPED TO THE GRID. The card describes the next seven days, but the page
 * only holds the weeks it is displaying — browse to December and this week's
 * entries are not in memory. Rather than fetch more or quietly count unloaded
 * days as free, the window shrinks to what the grid can see and reports the
 * span it actually used, so the copy can say "the next 3 days" and be true.
 * Returns null when today is off the grid entirely, which is the signal to
 * hide the card rather than show a claim about a month you are not looking at.
 */
export function nextDinnerGap(
  weeks: Date[][],
  byWeek: Map<string, PlannedWeek>,
  today: Date,
): DinnerGap | null {
  if (weeks.length === 0) return null

  const gridStart = weeks[0][0]
  const gridEnd = weeks[weeks.length - 1][6]
  if (today.getTime() < gridStart.getTime() || today.getTime() > gridEnd.getTime()) return null

  const wanted = addDays(today, HORIZON_DAYS - 1)
  const end = wanted.getTime() > gridEnd.getTime() ? gridEnd : wanted

  const dinners = new Set<string>()
  for (const week of weeks) {
    const summary = byWeek.get(formatPlanDate(week[0]))
    if (!summary) continue
    for (const date of week) {
      const has = summary.entries.some(
        (entry) => entry.dayOfWeek === dayNameOf(date) && entry.mealType === 'Dinner',
      )
      if (has) dinners.add(formatPlanDate(date))
    }
  }

  let open = 0
  let first: Date | null = null
  let horizonDays = 0

  for (let date = today; date.getTime() <= end.getTime(); date = addDays(date, 1)) {
    horizonDays++
    if (dinners.has(formatPlanDate(date))) continue
    open++
    if (!first) first = date
  }

  return { open, horizonDays, first }
}
