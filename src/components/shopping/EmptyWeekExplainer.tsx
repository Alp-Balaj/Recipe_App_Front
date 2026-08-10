// ─────────────────────────────────────────────────────────────────────────
// The explaining empty state (shopping list trust rework, Task 8).
//
// Today an empty list under `total === 0` says only "nothing here" — a user
// whose ingredients were hidden, or whose meals carry no ingredient list, has
// no idea why. This component replaces that dead end: it reads the week's
// diagnostics (Task 6/7's `ShoppingWeekDiagnostics`, optional — a cached
// response from before it existed has none) and the other-weeks probe, and
// renders whichever reasons actually apply, stacked as small cards in the
// page's existing banner idiom (`var(--chipbg)`, 1px `var(--border)`, radius
// 14 — see ShoppingListPage.tsx's own `banner` const).
//
// Only when NONE of hidden items, silent meals, unavailable recipes, or an
// owing other week explain the emptiness does it fall back to the old
// friendly copy, via the shared `StateBlock` — never rebuilt locally.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { ShoppingWeekDiagnostics } from '@/api/shopping'
import { weekRange } from '@/components/shopping/shoppingModel'
import StateBlock from '@/components/ui/StateBlock'

export interface EmptyWeekExplainerProps {
  /** weekRange(viewedWeek) — used only by the fallback copy. */
  weekLabel: string
  isCurrentWeek: boolean
  diagnostics: ShoppingWeekDiagnostics | undefined
  otherWeeks: { weekStartDate: string; unboughtCount: number }[]
  /**
   * Un-hide one item. `isPurchased` is the hidden group's OWN tick, read off the
   * diagnostics entry and handed back untouched — a mark is an explicit full set of both
   * flags, so restoring has to state one, and stating `false` for something the caller had
   * already bought unticks it on its way back onto the list (spec §3.1).
   */
  onRestore: (key: string, isPurchased: boolean) => void
  onJumpToWeek: (weekStartDate: string) => void
}

/** "Tue" from a UTC-midnight date. `'en'` (not the browser locale) because the
    exact weekday abbreviation is part of the copy, and `timeZone: 'UTC'` is
    load-bearing: without it a Monday-00:00Z date renders as Sunday west of
    Greenwich. */
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' })
}

export default function EmptyWeekExplainer(props: EmptyWeekExplainerProps): JSX.Element {
  const { weekLabel, isCurrentWeek, diagnostics, otherWeeks, onRestore, onJumpToWeek } = props

  const hiddenItems = diagnostics?.hiddenItems ?? []
  const silentMeals = diagnostics?.mealsWithoutIngredients ?? []
  const unavailableCount = diagnostics?.unavailableRecipeCount ?? 0

  const hasReasons =
    hiddenItems.length > 0 || silentMeals.length > 0 || unavailableCount > 0 || otherWeeks.length > 0

  if (!hasReasons) {
    return (
      <StateBlock
        title="Nothing on your list yet."
        body={`Plan some meals for ${isCurrentWeek ? 'this week' : weekLabel}, or add something of your own above.`}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      {hiddenItems.length > 0 && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {hiddenItems.length} item{hiddenItems.length === 1 ? '' : 's'} hidden for this week.
          </div>
          {hiddenItems.map((item) => (
            <div key={item.key} style={row}>
              <span>{item.displayName}</span>
              <button
                type="button"
                aria-label={`Restore ${item.displayName}`}
                style={smallButton}
                onClick={() => onRestore(item.key, item.isPurchased)}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {silentMeals.map((meal) => (
        <div key={`${meal.dishTitle}::${meal.date}::${meal.meal}`} style={card}>
          {meal.dishTitle} ({shortDay(meal.date)} · {meal.meal}) has no ingredient list, so it adds nothing
          here.
        </div>
      ))}

      {unavailableCount > 0 && (
        <div style={card}>
          {unavailableCount} planned meal{unavailableCount === 1 ? "'s" : "s'"} recipe is no longer
          available.
        </div>
      )}

      {otherWeeks.map((week) => (
        <button
          key={week.weekStartDate}
          type="button"
          style={otherWeekButton}
          onClick={() => onJumpToWeek(week.weekStartDate)}
        >
          Your plan for {weekRange(week.weekStartDate)} has {week.unboughtCount} items →
        </button>
      ))}
    </div>
  )
}

const card: CSSProperties = {
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '4px 0',
}

const smallButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface)',
}

const otherWeekButton: CSSProperties = {
  ...card,
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  fontFamily: 'inherit',
  fontWeight: 700,
}
