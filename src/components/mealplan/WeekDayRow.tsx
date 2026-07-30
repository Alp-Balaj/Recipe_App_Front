// ─────────────────────────────────────────────────────────────────────────
// One day of the week board (week/shopping rework, Task 8).
//
// DAYS AS ROWS, judgment inline. The row carries its own date, its three meals
// as chips, its effort and its planned calories, so the evidence and the verdict
// sit on the SAME LINE. The rejected alternative was a 7×3 grid with a summary
// chart underneath, which makes the reader eye-match a bar in a footer to a
// column in a grid — and it is exactly what this replaces.
//
// Space is spent in the ranked order of the signals: effort first (the one thing
// that decides whether a week is survivable), then the calorie read. Grocery
// weight and dinner repetition are week-level and live in WeekSummary.
//
// The row EDITS NOTHING. A chip opens a panel; the date opens that day's page,
// where editing lives. There is no add, no move, no cold start.
//
// Presentational: what a tap means belongs to the page, same rule as MealCard.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { MEAL_ORDER, type MealPlanEntry, type MealTypeName } from '@/api/mealPlans'
import type { DayJudgment } from '@/lib/weekJudgment'
import { isToday, planDayPath, shortDayOf } from '@/lib/planDates'
import { mealTokens } from './MealCard'
import LoadBar from './LoadBar'

interface Props {
  day: DayJudgment
  /** That day's entries only — the page has already filtered. */
  entries: MealPlanEntry[]
  /** The week's heaviest day, so every row is drawn to one scale. */
  maxMinutes: number
  /** The week's own average effort, drawn as the bar's marker. */
  averageMinutes: number
  /** The heaviest COUNTED day's calories, and the average over counted days. */
  maxCalories: number
  averageCalories: number
  /** A chip was tapped — the page opens the panel. */
  onSelect?: (entry: MealPlanEntry) => void
  /** The entry whose panel is open, so its chip can show as selected. */
  selectedEntryId?: string | null
}

export default function WeekDayRow({
  day,
  entries,
  maxMinutes,
  averageMinutes,
  maxCalories,
  averageCalories,
  onSelect,
  selectedEntryId = null,
}: Props) {
  const today = isToday(day.date)
  const planned = day.plannedCount > 0
  // Only worth stating once it is a real difference; below that the marker on
  // the bar already says everything a ratio would.
  const ratio = planned && averageMinutes > 0 ? day.minutes / averageMinutes : 0
  const showRatio = ratio >= 1.4

  return (
    <li
      data-testid={`week-day-${day.dayName}`}
      style={{ ...row, background: today ? 'var(--surface2)' : 'var(--surface)' }}
    >
      <div style={dateCell}>
        <Link to={planDayPath(day.date)} style={dateLink}>
          {shortDayOf(day.date)} {day.date.getUTCDate()}
        </Link>
        {today && <span style={todayChip}>Today</span>}
      </div>

      <div style={chips}>
        {MEAL_ORDER.map((meal) => {
          const entry = entries.find((candidate) => candidate.mealType === meal)
          return entry ? (
            <MealChip
              key={meal}
              meal={meal}
              entry={entry}
              dayName={day.dayName}
              selected={entry.id === selectedEntryId}
              onSelect={onSelect}
            />
          ) : (
            <span key={meal} style={emptyChip}>
              <span style={srOnly}>No {meal.toLowerCase()} planned</span>
              <span aria-hidden="true">—</span>
            </span>
          )
        })}
      </div>

      <div style={effortCell}>
        {planned ? (
          <>
            <LoadBar value={day.minutes} max={maxMinutes} average={averageMinutes} unit="m" />
            {showRatio && <span style={note}>{formatRatio(ratio)}× average</span>}
          </>
        ) : (
          // A day with no plan is not a day with no cooking time — it says
          // nothing rather than lying with a zero.
          <span style={nothing} aria-hidden="true">
            —
          </span>
        )}
      </div>

      <div style={calorieCell}>
        {planned ? (
          <LoadBar
            value={day.calories ?? 0}
            max={maxCalories}
            average={averageCalories}
            unit=" planned kcal"
            unknown={!day.isCalorieCounted}
          />
        ) : (
          <span style={nothing} aria-hidden="true">
            —
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * One planned meal. A button, because it opens the panel — and its accessible
 * name carries the day and meal as well as the dish: the same dinner planned
 * three times would otherwise give three identically-named buttons, and "which
 * Pasta al forno" is the only question that matters when you tap one.
 */
function MealChip({
  meal,
  entry,
  dayName,
  selected,
  onSelect,
}: {
  meal: MealTypeName
  entry: MealPlanEntry
  dayName: string
  selected: boolean
  onSelect?: (entry: MealPlanEntry) => void
}) {
  const { tint, ink } = mealTokens(meal)
  return (
    <button
      type="button"
      aria-label={`${entry.recipe.title}, ${dayName} ${meal.toLowerCase()}`}
      aria-pressed={selected}
      disabled={!onSelect}
      onClick={onSelect ? () => onSelect(entry) : undefined}
      style={{
        ...chip,
        background: tint,
        color: ink,
        cursor: onSelect ? 'pointer' : 'default',
        outline: selected ? '2px solid var(--accent)' : 'none',
      }}
    >
      {/* The meal is a colour AND a letter: colour alone would not survive a
          monochrome screen or a reader who cannot tell the three tints apart. */}
      <span style={mealMark} aria-hidden="true">
        {meal[0]}
      </span>
      <span style={chipTitle}>{entry.recipe.title}</span>
    </button>
  )
}

/** 2.24 → "2.2", 2.0 → "2" — one decimal, and none when it is whole. */
function formatRatio(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

// Flex with fixed bases rather than a grid: the columns still line up row to row
// (same bases, tabular numerals), but on a narrow canvas the two figure cells
// WRAP under the chips instead of forcing the page sideways. The board never
// scrolls horizontally at any width.
const row: CSSProperties = {
  listStyle: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '9px 12px',
}

const dateCell: CSSProperties = {
  flex: '0 0 66px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-start',
  minWidth: 0,
}

const dateLink: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  color: 'inherit',
  textDecoration: 'none',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

const todayChip: CSSProperties = {
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  borderRadius: 999,
  padding: '1px 7px',
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const chips: CSSProperties = {
  flex: '1 1 220px',
  display: 'flex',
  gap: 5,
  minWidth: 0,
}

const chip: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  border: '1px solid transparent',
  borderRadius: 9,
  padding: '5px 7px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'left',
}

const emptyChip: CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px dashed var(--border)',
  borderRadius: 9,
  padding: '5px 7px',
  fontSize: 12,
  color: 'var(--muted)',
}

const mealMark: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  opacity: 0.8,
  flexShrink: 0,
}

const chipTitle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const effortCell: CSSProperties = {
  flex: '0 0 104px',
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
}

const calorieCell: CSSProperties = {
  flex: '0 0 112px',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
}

const note: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
}

const nothing: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
}

// Same visually-hidden recipe as ShoppingListPage's srOnly.
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}
