// ─────────────────────────────────────────────────────────────────────────
// One line of the shopping list (week/shopping rework, Task 6).
//
// The list is ingredient-led now, so a row is an INGREDIENT and not a dish's
// requirement: "Flour" once, carrying the amounts each dish wants of it. That is
// the whole point of the projection — you buy flour once.
//
// Two decisions worth keeping:
//
//  · The checkbox carries the ingredient as its ACCESSIBLE NAME via aria-label,
//    with the visible name in a sibling span. A <label> wrapper would be the
//    obvious thing and is wrong here: it folds the quantities and dish names into
//    the accessible name too, so a screen reader announces "Flour 2 cups Pasta
//    500 g Bread checkbox" on every row. Carried over from the retired page.
//
//  · The parts ARE the dish list. Each reads "2 cups — Pasta", which says both
//    what to buy and what it is for, with the mapping intact; a separate
//    `group.dishes` line underneath would repeat those names verbatim. `dishes`
//    stays on the wire type because it is the DISTINCT set (a dish planned twice
//    contributes two parts) and the week board's insight strip wants it.
//
// Presentational — what a tick or a × MEANS belongs to the page, same rule as
// MealCard/MealPanel. In particular the page, not this component, decides that a
// Derived row is suppressed and a Manual row is deleted.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { ShoppingGroup } from '@/api/shopping'

export interface IngredientGroupProps {
  group: ShoppingGroup
  /** Explicit next value, never a toggle — the mark write is an explicit set. */
  onToggle: (isPurchased: boolean) => void
  /** Suppress (Derived) or delete (Manual) — the page reads `origin` and picks. */
  onRemove: () => void
  /** Rule above the row. Off for the first one in a card, which needs no divider. */
  divided?: boolean
}

export default function IngredientGroup({ group, onToggle, onRemove, divided = true }: IngredientGroupProps) {
  const bought = group.isPurchased

  return (
    <div style={{ ...row, opacity: bought ? 0.55 : 1, borderTop: divided ? row.borderTop : 'none' }}>
      <input
        type="checkbox"
        aria-label={group.displayName}
        checked={bought}
        onChange={(event) => onToggle(event.target.checked)}
        style={checkbox}
      />
      <span style={body}>
        <span style={{ ...name, textDecoration: bought ? 'line-through' : 'none' }}>
          {group.displayName}
        </span>
        <span style={parts}>
          {group.parts.map((part, index) => (
            // Index keys: parts have no id, and a group's parts are replaced
            // wholesale on every refetch — there is no reorder to preserve.
            <span key={index} style={part_}>
              {part.quantity} — {part.dishTitle}
            </span>
          ))}
        </span>
      </span>
      <button type="button" aria-label={`Remove ${group.displayName}`} onClick={onRemove} style={removeButton}>
        ×
      </button>
    </div>
  )
}

// A ticked row DIMS IN PLACE. It does not sink, grey-out-and-move, or animate to
// the bottom: the list you are reading in a shop must not rearrange itself under
// your thumb. Hiding bought rows is a separate, asked-for action (BoughtSection).
const row: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 4px',
  borderTop: '1px solid var(--border)',
}

const checkbox: CSSProperties = {
  width: 18,
  height: 18,
  marginTop: 1,
  flexShrink: 0,
  accentColor: 'var(--accent)',
  cursor: 'pointer',
}

const body: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const name: CSSProperties = {
  fontSize: 14.5,
  fontWeight: 700,
  letterSpacing: '-0.005em',
  overflowWrap: 'anywhere',
}

const parts: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
}

const part_: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  overflowWrap: 'anywhere',
}

const removeButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  width: 28,
  height: 28,
  lineHeight: 1,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--muted)',
}
