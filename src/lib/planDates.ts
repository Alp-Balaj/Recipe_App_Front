// ─────────────────────────────────────────────────────────────────────────
// Calendar-date helpers for the /plan/:date surface (meal-plan redesign).
//
// Everything here reads and writes dates in UTC, deliberately: weekStartOf()
// in api/mealPlans.ts already resolves a week from a date's UTC components,
// and the backend's WeekStartDate is a UTC-midnight Monday. Mixing a local
// "today" into that would make /plan and /plan/:date disagree about which day
// it is for a few hours either side of UTC midnight — consistency with the
// existing week resolution beats being locally correct in isolation.
//
// The route param is the plain "2026-07-29" calendar form, so a day page URL
// is readable and shareable.
// ─────────────────────────────────────────────────────────────────────────

import { DAY_ORDER, type DayName } from '@/api/mealPlans'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * "2026-07-29" → that day at UTC midnight, or null when the segment is
 * malformed or not a real calendar date. The round-trip check is what rejects
 * overflow: new Date("2026-02-31") happily parses as 3 March.
 */
export function parsePlanDate(value: string | undefined): Date | null {
  if (!value || !ISO_DATE.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return formatPlanDate(date) === value ? date : null
}

/** A UTC-midnight Date → the "2026-07-29" form the route uses. */
export function formatPlanDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The route path for a day. */
export function planDayPath(date: Date): string {
  return `/plan/${formatPlanDate(date)}`
}

/** The .NET DayOfWeek name for a date — the key plan entries are stored under. */
export function dayNameOf(date: Date): DayName {
  // getUTCDay(): 0 = Sunday, but DAY_ORDER is Monday-first.
  return DAY_ORDER[(date.getUTCDay() + 6) % 7]
}

/** A new Date `days` away, without mutating the input. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

/** "Wednesday 29 July" — the day page heading. */
export function dayHeadingOf(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

/** "Tue" / "Thu" — the previous/next day arrows. */
export function shortDayOf(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

/**
 * Today on the same UTC-midnight basis every plan date uses — matching
 * weekStartOf(new Date()), which reads `now` through its UTC components too.
 */
export function todayPlanDate(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Same calendar day as today? Used to mark the day page's "today" state. */
export function isToday(date: Date): boolean {
  return formatPlanDate(date) === formatPlanDate(todayPlanDate())
}

/** Strictly before today — a past slot is a record, not an invitation. */
export function isPast(date: Date): boolean {
  return date.getTime() < todayPlanDate().getTime()
}

// ── Month grid ──────────────────────────────────────────────────────────────

/** "July 2026" — the month view's title. */
export function monthLabelOf(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** "Jul" — the month view's prev/next arrows. */
export function shortMonthOf(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
}

/** The UTC first-of-month containing `date`. */
export function monthStartOf(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

/** `months` away, normalised to the first of that month. */
export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

/** Same calendar month and year? Used to recede the leading/trailing days. */
export function isSameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

/**
 * The month laid out Monday-first, as whole weeks — 5 rows usually, 4 or 6 at
 * the edges. Every ROW IS A WEEK, which is what lets the month view carry a
 * per-week summary rail without inventing any structure of its own.
 */
export function monthGridWeeks(monthStart: Date): Date[][] {
  const leading = (monthStart.getUTCDay() + 6) % 7 // days since Monday
  const gridStart = addDays(monthStart, -leading)
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const rows = Math.ceil((leading + daysInMonth) / 7)

  return Array.from({ length: rows }, (_, week) =>
    Array.from({ length: 7 }, (_, dayOfWeek) => addDays(gridStart, week * 7 + dayOfWeek)),
  )
}

/** "2026-07" ⇄ a month, for the ?m= parameter that makes a month linkable. */
export function formatMonthParam(date: Date): string {
  return formatPlanDate(date).slice(0, 7)
}

export function parseMonthParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null
  const parsed = parsePlanDate(`${value}-01`)
  return parsed ? monthStartOf(parsed) : null
}

/** The week board's route for the week containing `date`. */
export function planWeekPath(date: Date): string {
  return `/plan/week/${formatPlanDate(date)}`
}

/**
 * "3 – 9 Aug", or "27 Jul – 2 Aug" across a month boundary — the week strip's
 * range label. The month is named once when it can be, because the strip sits
 * directly under seven cells that are already numbered.
 *
 * Deliberately NOT weekRangeLabel from MealPlanWeekPage, which spells the
 * weekdays out ("Wed 27 Jul – Sun 2 Aug"): right for a page heading, too long
 * for a strip that also carries coverage, cook time and a destination.
 *
 * Assembled from day numbers plus shortMonthOf rather than a locale range
 * format, so the order of the parts is ours and only the abbreviation is the
 * platform's.
 */
export function weekRangeShortOf(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const tail = `${end.getUTCDate()} ${shortMonthOf(end)}`
  return isSameMonth(weekStart, end)
    ? `${weekStart.getUTCDate()} – ${tail}`
    : `${weekStart.getUTCDate()} ${shortMonthOf(weekStart)} – ${tail}`
}
