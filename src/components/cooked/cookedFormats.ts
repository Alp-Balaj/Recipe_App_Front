// ─────────────────────────────────────────────────────────────────────────
// How Cooked words its two recurring facts — how often, and when (KAN-5).
//
// Extracted because the dish page opens directly out of the dish row, so the
// same fact is on screen either side of one tap. Copies drift: the row said
// "last 7 August" and the page it opened said "last Friday, 7 August" for the
// same cook, which reads as two different dates being reported.
//
// The two date shapes are a deliberate distinction, not an accident to
// collapse:
//
//   longDate       — a DISH-level date ("last cooked"). No weekday: it answers
//                    "how long ago", and a weekday on a date months back is
//                    noise.
//   cookDate       — ONE cook's date. Weekday included, because a cook is
//                    remembered as an occasion ("the Friday I made this"), which
//                    is the same call /plan/cooks makes for the same reason.
//
// Both format in LOCAL time, matching CookHistoryPage and the dish row. That is
// deliberately not lib/planDates.ts's UTC: a plan date is a day-typed bucket
// key, whereas a cook is an instant, and rendering an instant in UTC would move
// an evening cook onto the wrong day for anyone west of Greenwich.
// ─────────────────────────────────────────────────────────────────────────

/** "Cooked once" / "Cooked twice" / "Cooked 4 times". */
export function timesCooked(count: number): string {
  if (count === 1) return 'Cooked once'
  if (count === 2) return 'Cooked twice'
  return `Cooked ${count} times`
}

/** A dish-level date — "7 August", with the year only when it is not this one. */
export function longDate(value: string): string {
  return format(value, {})
}

/** One cook's date — "Friday, 7 August". */
export function cookDate(value: string): string {
  return format(value, { weekday: 'long' })
}

function format(value: string, extra: Intl.DateTimeFormatOptions): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    ...extra,
    day: 'numeric',
    month: 'long',
    // The year earns its place only when the date is not in the current one —
    // "7 August 2026" on every row of a list read in 2026 is noise.
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}
