// ─────────────────────────────────────────────────────────────────────────
// The week grid (meal-planning-ui plan, Task 5) — 7 days × 3 meals,
// presentational: it takes the flat entry list from GET /meal-plans/{id} and
// places each entry in its slot. No fetching, no mutations.
//
// Desktop (≥1024px): a CSS grid of one day-label column plus three meal
// columns, with a meal header row. Below that: a single column of day
// sections, each listing its three labelled slots — the same responsive split
// every other surface uses (useMediaQuery, not user-agent sniffing).
//
// `onSlotClick` / `onRemove` were declared by Task 5 and are wired by Task 6,
// which adds `onMove` + `movingEntryId` for select-then-place moves (no
// drag-and-drop library may be added). Still presentational: every decision
// about what a tap means belongs to the page.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  DAY_ORDER,
  MEAL_ORDER,
  type DayName,
  type MealPlanEntry,
  type MealTypeName,
} from '@/api/mealPlans'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { addDays, planDayPath } from '@/lib/planDates'
import SlotCell from './SlotCell'

interface Props {
  entries: MealPlanEntry[]
  onSlotClick?: (day: DayName, meal: MealTypeName) => void
  onRemove?: (entryId: string) => void
  /** Start a move from a filled slot; the page then places it on the next tap. */
  onMove?: (entry: MealPlanEntry) => void
  /** The entry currently awaiting a destination, if any. */
  movingEntryId?: string | null
  /**
   * The week's UTC-midnight Monday. Supplied, each day label becomes a link to
   * that day's page; omitted, the labels stay plain text — which is what keeps
   * this component renderable without a Router (see WeekGrid.test.tsx).
   */
  weekStart?: string
}

export default function WeekGrid({
  entries,
  onSlotClick,
  onRemove,
  onMove,
  movingEntryId = null,
  weekStart,
}: Props) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  /** The day label — a link into /plan/:date only when the week's date is known. */
  const dayLabelNode = (day: DayName, style: CSSProperties): ReactNode => {
    if (!weekStart) return <div style={style}>{day}</div>
    const date = addDays(new Date(weekStart), DAY_ORDER.indexOf(day))
    return (
      <div style={style}>
        <Link to={planDayPath(date)} style={dayLink}>
          {day}
        </Link>
      </div>
    )
  }

  // One pass over the entries, indexed by slot — the grid then reads 21 keys.
  const bySlot = useMemo(() => {
    const map = new Map<string, MealPlanEntry>()
    for (const entry of entries) map.set(`${entry.dayOfWeek}-${entry.mealType}`, entry)
    return map
  }, [entries])

  const cellFor = (day: DayName, meal: MealTypeName) => {
    const entry = bySlot.get(`${day}-${meal}`)
    return (
      <SlotCell
        key={`${day}-${meal}`}
        day={day}
        meal={meal}
        entry={entry}
        onClick={onSlotClick ? () => onSlotClick(day, meal) : undefined}
        onRemove={entry && onRemove ? () => onRemove(entry.id) : undefined}
        onMove={entry && onMove ? () => onMove(entry) : undefined}
        isMoving={Boolean(entry && movingEntryId === entry.id)}
      />
    )
  }

  if (isDesktop) {
    // Three meal columns can't squash indefinitely (a slot holds a thumb, a
    // title and two buttons), so the grid keeps a floor width and the wrapper
    // — not the page — takes the horizontal scroll on a narrow canvas.
    return (
      <div style={scrollFrame}>
        <div style={desktopGrid}>
          <div />
          {MEAL_ORDER.map((meal) => (
            <div key={meal} style={columnHeader}>
              {meal}
            </div>
          ))}

          {DAY_ORDER.map((day) => (
            <div key={day} style={{ display: 'contents' }}>
              {dayLabelNode(day, dayLabel)}
              {MEAL_ORDER.map((meal) => cellFor(day, meal))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Mobile / tablet: one column of days. Every track is `minmax(0, 1fr)` or a
  // fixed label, so the rows shrink to the viewport instead of pushing it wide
  // — nothing here ever needs a horizontal scroll, even at 375px.
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: '100%' }}>
      {DAY_ORDER.map((day) => (
        <section key={day} style={{ minWidth: 0 }}>
          {dayLabelNode(day, { ...dayLabel, marginBottom: 8 })}
          <div style={{ display: 'grid', gap: 8 }}>
            {MEAL_ORDER.map((meal) => (
              <div key={meal} style={mobileRow}>
                <div style={mealLabel}>{meal}</div>
                {cellFor(day, meal)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Owns any overflow the grid produces, so the page itself never scrolls sideways. */
const scrollFrame: CSSProperties = {
  maxWidth: '100%',
  overflowX: 'auto',
  paddingBottom: 4,
}

const desktopGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '110px repeat(3, minmax(150px, 1fr))',
  alignItems: 'center',
  gap: 10,
  minWidth: 620,
}

const mobileRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '72px minmax(0, 1fr)',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
}

const columnHeader: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  paddingLeft: 4,
}

const dayLabel: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 800,
}

const dayLink: CSSProperties = {
  color: 'inherit',
  textDecoration: 'none',
}

const mealLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
}
