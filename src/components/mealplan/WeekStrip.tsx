// ─────────────────────────────────────────────────────────────────────────
// The seven-day strip — "what's coming up?" (plan-page redesign §1).
//
// A month grid's row, at one week's scale and with room for the dish names the
// month can only hint at. Every visual rule here is MonthGrid's, deliberately:
// the same meal-temperature chips, the same repeat mark, the same cook-load
// thresholds. Two surfaces disagreeing about what a heavy day looks like would
// be worse than either choice.
//
// The one rule this adds is the open DINNER: dashed clay rather than dashed
// border, because dinner is the slot the app treats as load-bearing (it is the
// only meal nextDinnerGap counts, and the only one the coverage strip names).
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { MealTypeName } from '@/api/mealPlans'
import { planDayPath } from '@/lib/planDates'
import type { WeekDay } from '@/lib/planWeek'
import { mealTokens } from './MealCard'

// Identical to MonthGrid's, and imported nowhere from it only because they are
// module-private there. A day at or past HEAVY reads as clay on both surfaces.
const FULL_LOAD_MINUTES = 180
const HEAVY_LOAD_MINUTES = 150

interface Props {
  days: WeekDay[]
  todayKey: string
  /** "2026-08-11|recipe-id" for a dish also planned the day before. */
  repeats: Set<string>
}

export default function WeekStrip({ days, todayKey, repeats }: Props) {
  return (
    <div style={grid}>
      {days.map((day) => {
        const isToday = day.key === todayKey

        return (
          <Link
            key={day.key}
            to={planDayPath(day.date)}
            style={{
              ...cell,
              ...(isToday
                ? { background: 'var(--chipbg)', border: '2px solid var(--accent-fill)' }
                : null),
            }}
          >
            <div style={cellHead}>
              <span style={{ ...weekday, ...(isToday ? { color: 'var(--accent)' } : null) }}>
                {day.date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })}
              </span>
              <span style={{ ...dayNumber, ...(isToday ? { color: 'var(--accent)' } : null) }}>
                {day.date.getUTCDate()}
              </span>
              {isToday ? (
                <span style={todayLabel}>TODAY</span>
              ) : (
                <span style={freeLabel}>{day.openSlots.length} free</span>
              )}
            </div>

            {day.entries.map((entry) => {
              const { tint, ink } = mealTokens(entry.mealType)
              // Unavailable meals (KAN-1) carry no id, so they are never repeats.
              const repeated = entry.recipe ? repeats.has(`${day.key}|${entry.recipe.id}`) : false

              return (
                <span
                  key={entry.id}
                  title={`${entry.mealType}: ${entry.recipe ? entry.recipe.title : 'unavailable'}`}
                  style={{
                    ...chip,
                    background: tint,
                    color: ink,
                    ...(repeated ? { borderLeft: '3px solid var(--clay)' } : null),
                    ...(entry.recipe ? {} : { opacity: 0.5 }),
                  }}
                >
                  {entry.recipe ? entry.recipe.title : 'Unavailable'}
                </span>
              )
            })}

            {day.openSlots.map((meal) => (
              <span key={meal} style={emptyChipFor(meal)}>
                + {meal.toLowerCase()}
              </span>
            ))}

            {day.minutes > 0 && (
              <span style={loadTrack}>
                <span
                  style={{
                    ...loadFill,
                    width: `${Math.min(100, (day.minutes / FULL_LOAD_MINUTES) * 100)}%`,
                    background:
                      day.minutes >= HEAVY_LOAD_MINUTES ? 'var(--clay)' : 'var(--accent-fill)',
                  }}
                />
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

/** An open dinner is clay; the other two are a plain dashed outline. */
function emptyChipFor(meal: MealTypeName): CSSProperties {
  const dinner = meal === 'Dinner'
  return {
    ...chip,
    fontWeight: 500,
    textAlign: 'center',
    background: 'transparent',
    border: `1px dashed ${dinner ? 'var(--clay)' : 'var(--border)'}`,
    color: dinner ? 'var(--clay)' : 'var(--muted)',
    whiteSpace: 'normal',
  }
}

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 8,
}

const cell: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '11px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
  minHeight: 172,
  textDecoration: 'none',
  color: 'inherit',
}

const cellHead: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 5,
}

const weekday: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 12.5,
  color: 'var(--muted)',
}

const dayNumber: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 17,
  fontWeight: 600,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text)',
}

const todayLabel: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.06em',
  color: 'var(--muted)',
}

const freeLabel: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 9.5,
  fontWeight: 600,
  color: 'var(--muted)',
}

const chip: CSSProperties = {
  fontSize: 11.5,
  lineHeight: 1.3,
  fontWeight: 700,
  borderRadius: 8,
  padding: '6px 8px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
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
