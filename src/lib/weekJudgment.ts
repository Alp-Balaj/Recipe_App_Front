// ─────────────────────────────────────────────────────────────────────────
// The week board's pure arithmetic — "days as rows, judgment inline".
//
// Every day carries its own effort (minutes) and calorie figure so the
// evidence and the verdict sit on the same line. This module is the
// arithmetic only: no components, no fetching, no hooks.
//
// Built ON TOP of planInsights' dayLoads/dayCalories rather than duplicating
// them, so the calorie honesty rule — a day with any planned dish lacking a
// calorie figure reports null, never a smaller number — holds here too. A
// short bar on a chart reads as "a light day", and a day whose lunch merely
// has no figure is not a light day.
// ─────────────────────────────────────────────────────────────────────────

import type { DayName, MealPlanEntry } from '@/api/mealPlans'
import { addDays, dayNameOf, formatPlanDate } from './planDates'
import { dayCalories, dayLoads, type PlannedWeek } from './planInsights'

export interface DayJudgment {
  date: Date
  dayName: DayName
  minutes: number
  calories: number | null
  plannedCount: number
  isCalorieCounted: boolean
}

/**
 * A week's seven days, each judged on its own terms, plus the week's own
 * average to judge them against — "heavy" and "light" are relative to what
 * this week actually asked, not some fixed number.
 *
 * `averageMinutes` is averaged over days that have something planned, not
 * all seven: a week with a single 100-minute day averages 100, not 100/7.
 * A week with nothing planned reports 0 and a null heaviestDay — a week
 * with no plan is not a week with no cooking time, so it says nothing
 * rather than lying with zeros.
 *
 * `averageMinutes` is returned as the RAW float, deliberately unrounded — a
 * caller formatting it for display can round to whatever precision the
 * surface wants, but rounding here would throw away precision a future
 * consumer (e.g. a running weekly total) might need.
 *
 * `heaviestDay`'s tie-break favours the EARLIER day: the reduction only
 * replaces the current heaviest on a strict `>`, so among equal-minute days
 * the one that comes first in the week (Monday-first order) wins.
 */
export function weekJudgment(
  weekStart: Date,
  entries: MealPlanEntry[],
): { days: DayJudgment[]; averageMinutes: number; heaviestMinutes: number; heaviestDay: DayJudgment | null } {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekKey = formatPlanDate(weekStart)
  const byWeek = new Map<string, PlannedWeek>([[weekKey, { weekStart: weekKey, entries }]])
  const loads = dayLoads([dates], byWeek)

  const days: DayJudgment[] = dates.map((date) => {
    const load = loads.get(formatPlanDate(date))
    const calories = dayCalories(load)
    return {
      date,
      dayName: dayNameOf(date),
      minutes: load?.minutes ?? 0,
      calories,
      plannedCount: load?.planned ?? 0,
      isCalorieCounted: calories !== null,
    }
  })

  const plannedDays = days.filter((day) => day.plannedCount > 0)
  const averageMinutes = plannedDays.length === 0
    ? 0
    : plannedDays.reduce((sum, day) => sum + day.minutes, 0) / plannedDays.length

  const heaviestDay = plannedDays.length === 0
    ? null
    : plannedDays.reduce((heaviest, day) => (day.minutes > heaviest.minutes ? day : heaviest))
  const heaviestMinutes = heaviestDay?.minutes ?? 0

  return { days, averageMinutes, heaviestMinutes, heaviestDay }
}

/**
 * Dishes repeated across the week's DINNERS only — breakfast and lunch are
 * ignored entirely. Eating the same oats every weekday is a deliberate,
 * efficient choice, and flagging it would be nagging the user about a
 * decision they made on purpose.
 *
 * Matched on recipe ID, not title — mirroring planInsights.repeatedFromYesterday's
 * deliberate choice ("two different recipes both called 'Pasta' are not the
 * same dinner twice"). Grouping by title would make the month and week
 * surfaces disagree about what a repeat is. The displayed `title` is
 * whichever planning of that recipe is LAST in `entries`, so an edited
 * recipe title shows current, not stale.
 *
 * Only dishes appearing 2+ times qualify; sorted by count descending, then
 * title ordinal.
 */
export function dinnerRepeats(entries: MealPlanEntry[]): { title: string; count: number }[] {
  const groups = new Map<string, { title: string; count: number }>()
  for (const entry of entries) {
    if (entry.mealType !== 'Dinner') continue
    const existing = groups.get(entry.recipe.id)
    if (existing) {
      existing.count++
      existing.title = entry.recipe.title
    } else {
      groups.set(entry.recipe.id, { title: entry.recipe.title, count: 1 })
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.count >= 2)
    .sort((a, b) => b.count - a.count || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0))
}
