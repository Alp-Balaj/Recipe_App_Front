// ─────────────────────────────────────────────────────────────────────────
// What /plan can work out about the current week (plan-page redesign).
//
// Pure functions over one week's entries — no fetching, no hooks, same rule as
// planInsights.ts (which does the same job for the MONTH grid and is reused
// as-is for the calorie ribbon; nothing here duplicates it).
//
// Everything the page counts more than once lives here, following
// shoppingModel.ts's precedent: the header's "9 of 21 planned", the coverage
// strip's "9 / 21", each cell's "N free" and the open-dinner sentence are four
// renderings of two numbers, and they must not be able to disagree.
// ─────────────────────────────────────────────────────────────────────────

import { MEAL_ORDER, type DayName, type MealPlanEntry, type MealTypeName } from '@/api/mealPlans'
import { addDays, dayNameOf, formatPlanDate, planDayPath, shortDayOf } from './planDates'

/** Three meals a day, seven days — the denominator the whole page counts against. */
export const SLOTS_PER_WEEK = 21

export interface WeekDay {
  date: Date
  /** "2026-08-10" — the key every map here uses. */
  key: string
  dayName: DayName
  /** Planned entries for this day, in MEAL_ORDER. */
  entries: MealPlanEntry[]
  /** Slots with nothing in them, in MEAL_ORDER. */
  openSlots: MealTypeName[]
  /** Prep + cook summed across the day's entries. */
  minutes: number
}

/**
 * The week as seven days, Monday first.
 *
 * Entries carry a dayOfWeek NAME, not a date — the date comes from the week
 * start, which is why this takes both and why nothing downstream re-derives it.
 */
export function weekDays(weekStart: Date, entries: MealPlanEntry[]): WeekDay[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDays(weekStart, offset)
    const dayName = dayNameOf(date)
    const forDay = entries.filter((entry) => entry.dayOfWeek === dayName)

    const ordered = MEAL_ORDER.map((meal) => forDay.find((entry) => entry.mealType === meal)).filter(
      (entry): entry is MealPlanEntry => entry !== undefined,
    )

    return {
      date,
      key: formatPlanDate(date),
      dayName,
      entries: ordered,
      openSlots: MEAL_ORDER.filter((meal) => !forDay.some((entry) => entry.mealType === meal)),
      minutes: ordered.reduce((sum, entry) => sum + entry.recipe.totalTimeMinutes, 0),
    }
  })
}

export interface WeekCoverage {
  planned: number
  total: number
  /** Prep + cook across the whole week. */
  minutes: number
  /** How many entries there are — a dish planned twice counts twice. */
  dishes: number
}

export function weekCoverage(days: WeekDay[]): WeekCoverage {
  const planned = days.reduce((sum, day) => sum + day.entries.length, 0)
  return {
    planned,
    total: SLOTS_PER_WEEK,
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    dishes: planned,
  }
}

export interface NextUp {
  entry: MealPlanEntry
  date: Date
  /** "TONIGHT" / "TOMORROW" / "THURSDAY" — the hero eyebrow's second half. */
  whenLabel: string
}

/**
 * The next planned meal that has not been cooked — the hero's whole subject.
 *
 * Ordered by (date, meal), not by the order the server returned entries in.
 * Starts at today rather than at "now": a dinner is still the next thing to
 * cook at 9pm, and dropping it because the clock passed some notional dinner
 * time would leave the hero showing tomorrow's breakfast while tonight's dinner
 * sat unplanned-looking on the strip.
 *
 * `cookedEntryIds` is what makes it "uncooked". Passing an empty set is safe and
 * simply means every planned meal is still a candidate — the hero then shows
 * something you have already made, which is wrong but not broken, so callers
 * should pass the recent cook log rather than skipping it.
 */
export function nextUp(days: WeekDay[], today: Date, cookedEntryIds: ReadonlySet<string>): NextUp | null {
  const todayKey = formatPlanDate(today)
  const tomorrowKey = formatPlanDate(addDays(today, 1))

  for (const day of days) {
    if (day.key < todayKey) continue

    for (const entry of day.entries) {
      if (cookedEntryIds.has(entry.id)) continue

      return {
        entry,
        date: day.date,
        whenLabel:
          day.key === todayKey
            ? 'TONIGHT'
            : day.key === tomorrowKey
              ? 'TOMORROW'
              : day.date
                  .toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })
                  .toUpperCase(),
      }
    }
  }

  return null
}

/**
 * Dishes repeated from the day before, keyed "2026-08-11|recipe-id".
 *
 * Same rule and same key shape as planInsights.repeatedFromYesterday — matched
 * on recipe id, never title, and the mark belongs to the SECOND day. Kept
 * separate only because that one works over a month grid's week map and this
 * one over a single week's day list; the semantics are deliberately identical
 * so a dish reads the same on both surfaces.
 *
 * Monday cannot be marked here: its predecessor is last week, which this page
 * does not hold. That under-claims rather than inventing, which is the right
 * direction, and is the same silent miss the month grid's first day has.
 */
export function repeatsWithinWeek(days: WeekDay[]): Set<string> {
  const out = new Set<string>()

  for (let i = 1; i < days.length; i++) {
    const before = new Set(days[i - 1].entries.map((entry) => entry.recipe.id))
    for (const entry of days[i].entries) {
      if (before.has(entry.recipe.id)) out.add(`${days[i].key}|${entry.recipe.id}`)
    }
  }

  return out
}

export interface OpenDinners {
  /** Days from today onward with no dinner planned. */
  days: WeekDay[]
  /** "Wed, Sun and Thu", or "" when there are none. */
  label: string
}

/**
 * Open dinners from today onward — the coverage strip's sentence, and where
 * "Fill the gaps ›" points.
 *
 * Dinner only, and from today only, both for planInsights.nextDinnerGap's
 * reasons: dinner is the meal people actually plan, and a gap in the past is
 * not a gap, it is a Tuesday you ate something else.
 */
export function openDinners(days: WeekDay[], today: Date): OpenDinners {
  const todayKey = formatPlanDate(today)
  const open = days.filter((day) => day.key >= todayKey && day.openSlots.includes('Dinner'))

  const names = open.map((day) => shortDayOf(day.date))
  const label =
    names.length === 0
      ? ''
      : names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  return { days: open, label }
}

/**
 * Where "Fill the gaps ›" goes: the first day with an open dinner.
 *
 * Falls back to today when there are none, so the link is never dead — though
 * the caller only renders it when there is at least one gap.
 */
export function planDayPathForFirstGap(gaps: OpenDinners): string {
  const first = gaps.days[0]
  return first ? planDayPath(first.date) : planDayPath(new Date())
}

/** "4h 20m", the section heading's cook-time figure. "" when nothing is planned. */
export function formatWeekMinutes(minutes: number): string {
  if (minutes <= 0) return ''
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  if (rest === 0) return `${hours}h`
  return `${hours}h ${rest}m`
}

/**
 * "10 – 16 August", or "27 July – 2 August" across a month boundary — the
 * page title.
 *
 * The long form, unlike planDates.weekRangeShortOf's "10 – 16 Aug": this is a
 * 32px display-serif heading with nothing else on its line, so the month gets
 * its full name.
 */
export function weekRangeLongOf(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const month = (date: Date) => date.toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' })
  const tail = `${end.getUTCDate()} ${month(end)}`

  return weekStart.getUTCMonth() === end.getUTCMonth()
    ? `${weekStart.getUTCDate()} – ${tail}`
    : `${weekStart.getUTCDate()} ${month(weekStart)} – ${tail}`
}
