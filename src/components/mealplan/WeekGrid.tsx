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
// `onSlotClick` / `onRemove` are declared now and wired by Task 6.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties } from 'react'
import {
  DAY_ORDER,
  MEAL_ORDER,
  type DayName,
  type MealPlanEntry,
  type MealTypeName,
} from '@/api/mealPlans'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import SlotCell from './SlotCell'

interface Props {
  entries: MealPlanEntry[]
  onSlotClick?: (day: DayName, meal: MealTypeName) => void
  onRemove?: (entryId: string) => void
}

export default function WeekGrid({ entries, onSlotClick, onRemove }: Props) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

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
      />
    )
  }

  if (isDesktop) {
    return (
      <div style={desktopGrid}>
        <div />
        {MEAL_ORDER.map((meal) => (
          <div key={meal} style={columnHeader}>
            {meal}
          </div>
        ))}

        {DAY_ORDER.map((day) => (
          <div key={day} style={{ display: 'contents' }}>
            <div style={dayLabel}>{day}</div>
            {MEAL_ORDER.map((meal) => cellFor(day, meal))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {DAY_ORDER.map((day) => (
        <section key={day}>
          <div style={{ ...dayLabel, marginBottom: 8 }}>{day}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {MEAL_ORDER.map((meal) => (
              <div key={meal} style={{ display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center', gap: 10 }}>
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

const desktopGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '110px repeat(3, minmax(0, 1fr))',
  alignItems: 'center',
  gap: 10,
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

const mealLabel: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
}
