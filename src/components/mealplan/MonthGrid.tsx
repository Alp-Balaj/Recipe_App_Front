// ─────────────────────────────────────────────────────────────────────────
// The month calendar (meal-plan redesign, month PR) — the plan's front door.
//
// Two renderings of one idea, because a month cell is ~155px in the wide
// desktop column and ~38px on a phone. Above 1024px a cell carries up to three
// MEAL CHIPS with real dish names, tinted by meal temperature. Below that the chips are
// unreadable, so it degrades to three dots in meal order — filled or hollow,
// position carrying which meal is missing. Pretending dish names fit at 38px
// would be the mistake in either direction.
//
// The week rail is the piece that earns the month view its keep: every row of
// a month grid ALREADY is a week, so the row's coverage and repeat warning sit
// at its end for free. That is the balance-checking the 7×3 board did, minus
// the board.
//
// Presentational: it takes resolved week summaries and renders them. No
// fetching, no mutations.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { MEAL_ORDER, type MealTypeName } from '@/api/mealPlans'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { WeekSummary } from '@/hooks/useMonthPlans'
import type { DayLoad } from '@/lib/planInsights'
import {
  dayNameOf,
  formatPlanDate,
  isPast,
  isSameMonth,
  planDayPath,
  planWeekPath,
} from '@/lib/planDates'
import { mealTokens } from './MealCard'

const SLOTS_PER_WEEK = 21
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  monthStart: Date
  weeks: Date[][]
  byWeek: Map<string, WeekSummary>
  today: Date
  /**
   * "2026-08-06|recipe-id" for every dish also planned the day before, from
   * repeatedFromYesterday. The mark rides on the CHIP rather than on the cell
   * border: a cell edge cannot join Sunday to Monday (opposite ends of two
   * rows), and the border is already carrying today and past.
   */
  repeats?: Set<string>
  /** Per-day cook load and calories, keyed "2026-08-06" — T1 reads the minutes. */
  loads?: Map<string, DayLoad>
}

/**
 * The bar's full width, in minutes. A FIXED reference rather than the month's
 * own maximum, so a light month doesn't render like a heavy one — the bars mean
 * the same thing in August as in September. Past it, the bar simply pins full.
 */
const FULL_LOAD_MINUTES = 180
/** Where a day stops being a normal cook and starts being a project. */
const HEAVY_LOAD_MINUTES = 150

export default function MonthGrid({ monthStart, weeks, byWeek, today, repeats, loads }: Props) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const todayKey = formatPlanDate(today)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={isDesktop ? headerRowDesktop : headerRowMobile}>
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} style={weekdayLabel}>
            {isDesktop ? label : label.charAt(0)}
          </div>
        ))}
        {isDesktop && <div style={{ ...weekdayLabel, textAlign: 'right' }}>Week</div>}
      </div>

      {weeks.map((week) => {
        const weekKey = formatPlanDate(week[0])
        const summary = byWeek.get(weekKey)
        const weekIsPast = isPast(week[6])

        return (
          <div key={weekKey} style={isDesktop ? headerRowDesktop : headerRowMobile}>
            {week.map((date) => {
              const key = formatPlanDate(date)
              const outside = !isSameMonth(date, monthStart)
              return isDesktop ? (
                <DesktopCell
                  key={key}
                  date={date}
                  outside={outside}
                  isToday={key === todayKey}
                  summary={summary}
                  repeats={repeats}
                  load={loads?.get(key)}
                />
              ) : (
                <MobileCell
                  key={key}
                  date={date}
                  outside={outside}
                  isToday={key === todayKey}
                  summary={summary}
                  repeats={repeats}
                  load={loads?.get(key)}
                />
              )
            })}
            {isDesktop && <WeekRail week={week} summary={summary} dim={weekIsPast} />}
          </div>
        )
      })}
    </div>
  )
}

/** The entry planned for one (day, meal), if any. */
function entryAt(summary: WeekSummary | undefined, date: Date, meal: MealTypeName) {
  if (!summary) return undefined
  const day = dayNameOf(date)
  return summary.entries.find((entry) => entry.dayOfWeek === day && entry.mealType === meal)
}

function DesktopCell({
  date,
  outside,
  isToday,
  summary,
  repeats,
  load,
}: {
  date: Date
  outside: boolean
  isToday: boolean
  summary?: WeekSummary
  repeats?: Set<string>
  load?: DayLoad
}) {
  const past = isPast(date)
  const dateKey = formatPlanDate(date)
  const filled = MEAL_ORDER.map((meal) => ({ meal, entry: entryAt(summary, date, meal) }))
  const open = filled.filter((slot) => !slot.entry)
  // One invitation per day, never three: only the next open slot is offered.
  const nextOpen = past ? undefined : open[0]?.meal

  return (
    <Link
      to={planDayPath(date)}
      aria-label={`Plan ${formatPlanDate(date)}`}
      style={{
        ...cellBase,
        ...(outside ? cellOutside : {}),
        ...(past && !outside ? cellPast : {}),
        ...(isToday ? cellToday : {}),
      }}
    >
      <span style={{ ...dateRow, ...(isToday ? { color: 'var(--accent)' } : {}) }}>
        <span>{date.getUTCDate()}</span>
        {!past && !outside && open.length > 0 && <span style={freeCount}>{open.length} free</span>}
      </span>

      {filled.map(({ meal, entry }) =>
        entry ? (
          <span
            key={meal}
            style={{
              ...chip,
              ...chipTint(meal),
              ...(repeats?.has(`${dateKey}|${entry.recipe.id}`) ? chipRepeat : {}),
            }}
            title={
              repeats?.has(`${dateKey}|${entry.recipe.id}`)
                ? `${entry.recipe.title} — also the day before`
                : undefined
            }
          >
            {entry.recipe.title}
          </span>
        ) : meal === nextOpen ? (
          <span key={meal} style={{ ...chip, ...chipHollow }}>
            + {meal.toLowerCase()}
          </span>
        ) : null,
      )}

      {/* T1 — a bar rather than a figure, because the only useful reading is
          against the neighbouring days, and 31 numbers do not get compared. */}
      {load && load.minutes > 0 && (
        <span style={loadTrack} title={`${formatCookTime(load.minutes)} in the kitchen`}>
          <span
            style={{
              ...loadFill,
              width: `${Math.min(100, (load.minutes / FULL_LOAD_MINUTES) * 100)}%`,
              background:
                load.minutes >= HEAVY_LOAD_MINUTES ? 'var(--clay)' : 'var(--accent-fill)',
            }}
          />
        </span>
      )}
    </Link>
  )
}

function MobileCell({
  date,
  outside,
  isToday,
  summary,
  repeats,
  load,
}: {
  date: Date
  outside: boolean
  isToday: boolean
  summary?: WeekSummary
  repeats?: Set<string>
  load?: DayLoad
}) {
  const past = isPast(date)
  const dateKey = formatPlanDate(date)

  return (
    <Link
      to={planDayPath(date)}
      aria-label={`Plan ${formatPlanDate(date)}`}
      style={{
        ...mobileCell,
        ...(outside ? cellOutside : {}),
        ...(past && !outside ? cellPast : {}),
        ...(isToday ? cellToday : {}),
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, ...(isToday ? { color: 'var(--accent)' } : {}) }}>
        {date.getUTCDate()}
      </span>
      <span style={{ display: 'flex', gap: 2 }} aria-hidden="true">
        {MEAL_ORDER.map((meal) => {
          const entry = entryAt(summary, date, meal)
          // The chip's clay edge has no room to exist at 38px, so the repeat
          // mark becomes the dot's own colour — same signal, same meaning.
          const repeated = entry ? repeats?.has(`${dateKey}|${entry.recipe.id}`) : false
          return (
            <span
              key={meal}
              style={{
                ...dot,
                background: entry
                  ? repeated
                    ? 'var(--clay)'
                    : mealTokens(meal).ink
                  : 'var(--border)',
              }}
            />
          )
        })}
      </span>
      {/* T1 on a phone: no room for a track, so the fill IS the mark — a short
          underline against a long one, comparable by length alone. */}
      {load && load.minutes > 0 && (
        <span
          aria-hidden="true"
          style={{
            ...mobileLoad,
            width: `${Math.max(18, Math.min(100, (load.minutes / FULL_LOAD_MINUTES) * 100) * 0.6)}%`,
            background: load.minutes >= HEAVY_LOAD_MINUTES ? 'var(--clay)' : 'var(--accent-fill)',
          }}
        />
      )}
    </Link>
  )
}

/**
 * A duration as the shortest thing that still reads as time: "45m", "3h",
 * "2h 15m". A full week can exceed ten hours, so bare minutes would stop
 * being legible as a load signal well before the top of the range.
 */
export function formatCookTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** Coverage, cook load and variety for one row — the row already being a week. */
function WeekRail({ week, summary, dim }: { week: Date[]; summary?: WeekSummary; dim: boolean }) {
  const count = summary?.entryCount ?? 0
  const minutes = summary?.totalMinutes ?? 0
  const dishes = summary?.distinctDishes ?? 0

  return (
    <Link
      to={planWeekPath(week[0])}
      aria-label={`Week of ${formatPlanDate(week[0])}`}
      style={{ ...railStyle, ...(dim ? { opacity: 0.45 } : {}) }}
    >
      <span style={railCount}>
        {count}/{SLOTS_PER_WEEK}
      </span>
      {/* Suppressed at zero rather than shown as "0m": an empty week's rail should
          read as empty, not as a week that somehow costs no time to cook. */}
      {minutes > 0 && <span style={railTime}>{formatCookTime(minutes)}</span>}
      {/* Suppressed at zero for the same reason as the time: an unplanned week
          has no dishes, and "0 dishes" states it twice. */}
      {dishes > 0 && (
        <span style={railDishes}>
          {dishes} {dishes === 1 ? 'dish' : 'dishes'}
        </span>
      )}
    </Link>
  )
}

function chipTint(meal: MealTypeName): CSSProperties {
  const { tint, ink } = mealTokens(meal)
  return { background: tint, color: ink }
}

const headerRowDesktop: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) 76px',
  gap: 5,
}

const headerRowMobile: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 4,
}

const weekdayLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  paddingBottom: 2,
}

// Desktop only (MobileCell keeps its own square-ish aspectRatio). The height
// tracks the width the wide column gives a cell — at ~155px across, 84px tall
// read as a letterbox with the three chips crowded into its top half.
const cellBase: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  minHeight: 120,
  padding: '6px 5px 5px',
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
  textDecoration: 'none',
  color: 'var(--text)',
}

const cellOutside: CSSProperties = {
  background: 'transparent',
  borderColor: 'transparent',
  opacity: 0.35,
}

const cellPast: CSSProperties = {
  opacity: 0.5,
}

const cellToday: CSSProperties = {
  borderColor: 'var(--accent-fill)',
  borderWidth: 2,
  background: 'var(--chipbg)',
  opacity: 1,
}

const dateRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1,
}

const freeCount: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--muted)',
  letterSpacing: '0.03em',
}

const chip: CSSProperties = {
  fontSize: 9.5,
  lineHeight: 1.25,
  fontWeight: 700,
  borderRadius: 5,
  padding: '2.5px 4px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

// B1′ — the repeat mark on the chip rather than the cell. A 2px clay edge on
// the dish that also ran yesterday, which works identically for Tue→Wed and
// for Sun→Mon, and leaves the cell border to today and past.
const chipRepeat: CSSProperties = {
  borderLeft: '2px solid var(--clay)',
  paddingLeft: 4,
}

const chipHollow: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--muted)',
  fontWeight: 500,
  textAlign: 'center',
}

const mobileCell: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  aspectRatio: '1 / 1.12',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  minWidth: 0,
  textDecoration: 'none',
  color: 'var(--text)',
}

const dot: CSSProperties = {
  width: 4,
  height: 4,
  borderRadius: 1,
}

const loadTrack: CSSProperties = {
  marginTop: 'auto',
  height: 3,
  borderRadius: 2,
  background: 'var(--border)',
  overflow: 'hidden',
  display: 'block',
}

const loadFill: CSSProperties = {
  display: 'block',
  height: '100%',
  borderRadius: 2,
}

const mobileLoad: CSSProperties = {
  height: 2,
  borderRadius: 1,
  display: 'block',
  opacity: 0.75,
}

const railStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-end',
  gap: 2,
  paddingLeft: 8,
  borderLeft: '1px solid var(--border)',
  textDecoration: 'none',
  minWidth: 0,
}

const railCount: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.02em',
}

// Secondary to the coverage count above it: muted, not accented. Coverage is
// the thing you act on ("this week has gaps"); time is context for it.
const railTime: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
}

// Context like the time above it, so it stays muted. Clay now means one thing
// only on this surface — a dish repeating from the day before — and it lives
// on the chip, not here.
const railDishes: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.01em',
  whiteSpace: 'nowrap',
}
