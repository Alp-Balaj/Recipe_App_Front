// ─────────────────────────────────────────────────────────────────────────
// Daily calories across the month, as spread rather than average.
//
// The argument for this shape over a single "2,050 a day" figure: nobody
// changes a plan because of a monthly average, but "Saturday is 3,400 and
// Tuesday is 900" is actionable. An average over a half-planned month is also
// arithmetic on a hole — the ribbon shows the holes instead of dividing them
// away.
//
// One series, so no legend — the label names it. Bars are zero-anchored and
// scaled to the month's own maximum; the tallest day is tinted, which is
// redundant with being tallest ON PURPOSE, so the reading survives any colour
// vision. Each bar carries a title for the exact figure, because a 13px tick
// can be compared but not read.
//
// Two densities. Above 1024px one tick per day. Below that a tick would be
// ~4px, so it collapses to one bar per week (R2) holding that week's average
// across its counted days — an average PER DAY, never a sum over seven, which
// would make a half-planned week look like a light one.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { dayCalories, type DayLoad } from '@/lib/planInsights'
import { formatPlanDate, isSameMonth } from '@/lib/planDates'

interface Props {
  weeks: Date[][]
  monthStart: Date
  loads: Map<string, DayLoad>
  /**
   * 'month' — the strip card on the month page (the original, unchanged).
   * 'plan' — /plan's §2: taller bars, no axis ticks, and a footer naming the
   * heaviest day, because the ruled section heading above it already carries
   * the label and the denominator.
   */
  variant?: 'month' | 'plan'
}

export interface CalorieCoverage {
  /** Days with a figure that can be stated honestly. */
  counted: number
  /** Days with anything planned at all. */
  planned: number
}

/**
 * The denominator, exported so a caller can render "from 16 of 19 planned days"
 * in its own heading and be certain it matches the bars underneath.
 *
 * Same two rules as the chart: a day is counted only when every planned meal
 * has a figure, and a planned-but-uncountable day stays in `planned`.
 */
export function calorieCoverage(
  weeks: Date[][],
  monthStart: Date,
  loads: Map<string, DayLoad>,
): CalorieCoverage {
  const days = weeks.flat().filter((date) => isSameMonth(date, monthStart))
  return {
    counted: days.filter((date) => dayCalories(loads.get(formatPlanDate(date))) !== null).length,
    planned: days.filter((date) => (loads.get(formatPlanDate(date))?.planned ?? 0) > 0).length,
  }
}

interface Bar {
  key: string
  /** Spoken form, for the title: "Sat 8". */
  label: string
  /** Axis form, for the tick: "8" / "w2". */
  short: string
  /** null when the span has nothing that can be honestly counted. */
  value: number | null
  /** Something IS planned here, it just can't be totalled. */
  planned: boolean
}

export default function CalorieRibbon({ weeks, monthStart, loads, variant = 'month' }: Props) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isPlan = variant === 'plan'

  const days = weeks.flat().filter((date) => isSameMonth(date, monthStart))
  const plannedDays = days.filter((date) => (loads.get(formatPlanDate(date))?.planned ?? 0) > 0)
  const countedDays = days.filter((date) => dayCalories(loads.get(formatPlanDate(date))) !== null)

  // Nothing planned in this month at all — the month view already says that
  // much with empty cells.
  if (plannedDays.length === 0) return null

  if (countedDays.length === 0) {
    return (
      <section style={card} aria-label="Daily calories">
        <span style={label}>Daily calories</span>
        <p style={note}>
          None of this month&rsquo;s dishes has a calorie figure yet. Add one on a recipe and it
          counts here.
        </p>
      </section>
    )
  }

  const bars: Bar[] = isDesktop ? dailyBars(days, loads) : weeklyBars(weeks, monthStart, loads)
  const max = Math.max(...bars.map((bar) => bar.value ?? 0))
  const peak = bars.reduce((best, bar) => ((bar.value ?? 0) > (best?.value ?? 0) ? bar : best), bars[0])

  const summary =
    `Daily calories, ${countedDays.length} of ${plannedDays.length} planned days counted.` +
    (peak?.value ? ` Highest ${peak.label}, ${peak.value.toLocaleString()} kcal.` : '')

  return (
    <section
      style={isPlan ? { ...card, padding: '16px 17px', gap: 8, flex: 'initial' } : card}
      aria-label="Daily calories"
    >
      {/* On /plan the ruled section heading above already carries both, and
          repeating them inside the card would say "Planned calories" twice. */}
      {!isPlan && (
        <div style={head}>
          <span style={label}>Daily calories</span>
          <span style={denominator}>
            from {countedDays.length} of {plannedDays.length} planned days
          </span>
        </div>
      )}

      <div style={isPlan ? { ...plot, height: 64, gap: 3 } : plot} role="img" aria-label={summary}>
        {bars.map((bar) => (
          <span
            key={bar.key}
            title={
              bar.value !== null
                ? `${bar.label} — ${bar.value.toLocaleString()} kcal`
                : bar.planned
                  ? `${bar.label} — planned, no calorie figure`
                  : `${bar.label} — nothing planned`
            }
            style={{
              ...barStyle,
              height: bar.value !== null ? `${Math.max(8, (bar.value / max) * 100)}%` : 4,
              background:
                bar.value === null
                  ? 'var(--border)'
                  : bar === peak
                    ? 'var(--clay)'
                    : 'var(--accent-fill)',
              opacity: bar.value === null ? 1 : bar === peak ? 0.95 : 0.6,
            }}
          />
        ))}
      </div>

      {/* /plan swaps the tick axis for a sentence: the bars sit under a heading
          that names the month, so the reader needs the outlier, not the scale. */}
      {isPlan ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {peak?.value
              ? `${peak.label} is your heaviest day at ${peak.value.toLocaleString()} kcal.`
              : 'No day has a calorie figure yet.'}
          </span>
          <span style={{ ...denominator, fontSize: 11.5, fontWeight: 400 }}>
            {monthRangeOf(monthStart)}
          </span>
        </div>
      ) : (
        <div style={axis} aria-hidden="true">
          {bars.map((bar, index) => (
            <span key={bar.key} style={tickLabel}>
              {isDesktop ? (index % 7 === 0 ? bar.short : '') : bar.short}
            </span>
          ))}
        </div>
      )}

      {!isDesktop && <span style={note}>Each bar is that week&rsquo;s average day.</span>}
    </section>
  )
}

/** "1 – 31 Aug" — the span the bars actually cover. */
function monthRangeOf(monthStart: Date): string {
  const end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0))
  const month = monthStart.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
  return `1 – ${end.getUTCDate()} ${month}`
}

/** One tick per day of the month. */
function dailyBars(days: Date[], loads: Map<string, DayLoad>): Bar[] {
  return days.map((date) => {
    const key = formatPlanDate(date)
    const load = loads.get(key)
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }),
      short: String(date.getUTCDate()),
      value: dayCalories(load),
      planned: (load?.planned ?? 0) > 0,
    }
  })
}

/**
 * One bar per grid row, averaged over the days in that row that could be
 * counted — a mean per day, so a week with three counted days is comparable to
 * one with seven rather than looking like a third of it.
 */
function weeklyBars(
  weeks: Date[][],
  monthStart: Date,
  loads: Map<string, DayLoad>,
): Bar[] {
  return weeks.map((week, index) => {
    const inMonth = week.filter((date) => isSameMonth(date, monthStart))
    const counted = inMonth
      .map((date) => dayCalories(loads.get(formatPlanDate(date))))
      .filter((value): value is number => value !== null)
    const planned = inMonth.some((date) => (loads.get(formatPlanDate(date))?.planned ?? 0) > 0)

    return {
      key: formatPlanDate(week[0]),
      label: `Week ${index + 1}`,
      short: `w${index + 1}`,
      value: counted.length
        ? Math.round(counted.reduce((sum, value) => sum + value, 0) / counted.length)
        : null,
      planned,
    }
  })
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 13px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  flex: '2 1 320px',
  minWidth: 0,
}

const head: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
}

const label: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const denominator: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const plot: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 2,
  height: 42,
}

// Rounded at the data end only, anchored to the baseline.
const barStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  borderRadius: '2px 2px 0 0',
  display: 'block',
}

const axis: CSSProperties = {
  display: 'flex',
  gap: 2,
}

const tickLabel: CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: 'center',
  fontSize: 8.5,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const note: CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: 'var(--muted)',
}
