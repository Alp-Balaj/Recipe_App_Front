// ─────────────────────────────────────────────────────────────────────────
// Relative-time formatting for the profile Activity tab (Recipe App Redesign).
// The Activity timeline is derived from real recipe createdAt timestamps, so
// this turns an ISO string into a compact "3 days ago" / "just now" label.
// ─────────────────────────────────────────────────────────────────────────

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

/**
 * ISO-8601 timestamp → "just now" / "5 min ago" / "3 days ago" / "2 mo ago".
 * `now` is injectable for deterministic tests; defaults to the current time.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((now - then) / 1000))

  if (seconds < 45) return 'just now'
  if (seconds < HOUR) return `${Math.round(seconds / MINUTE)} min ago`
  if (seconds < DAY) return plural(Math.round(seconds / HOUR), 'hour')
  if (seconds < WEEK) return plural(Math.round(seconds / DAY), 'day')
  if (seconds < MONTH) return plural(Math.round(seconds / WEEK), 'week')
  if (seconds < YEAR) return `${Math.round(seconds / MONTH)} mo ago`
  return plural(Math.round(seconds / YEAR), 'year')
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`
}
