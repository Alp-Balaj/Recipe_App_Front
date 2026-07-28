// ─────────────────────────────────────────────────────────────────────────
// One slot of the week grid (meal-planning-ui plan, Task 5) — a single
// (day, meal) cell, either filled with its planned recipe or an empty "+"
// affordance.
//
// Test hooks: the outer cell carries `data-testid="slot-cell"` (count the
// grid), the inner content carries `data-testid="slot-<Day>-<Meal>"` (address
// one slot) — an element can only carry one data-testid, hence the two levels.
//
// `onClick` / `onRemove` are declared now and wired by Task 6: this task
// renders the surface read-only, so the page passes neither and the cell is
// inert. Declaring them here means Task 6 changes no prop signature.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, KeyboardEvent } from 'react'
import type { DayName, MealPlanEntry, MealTypeName } from '@/api/mealPlans'
import { resolveImageUrl } from '@/lib/images'

interface Props {
  day: DayName
  meal: MealTypeName
  entry?: MealPlanEntry
  onClick?: () => void
  onRemove?: () => void
}

export default function SlotCell({ day, meal, entry, onClick, onRemove }: Props) {
  const interactive = Boolean(onClick)

  return (
    <div
      data-testid="slot-cell"
      style={{ ...cell, cursor: interactive ? 'pointer' : 'default' }}
      {...(interactive
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': entry ? `${meal} on ${day}: ${entry.recipe.title}` : `Add a recipe for ${meal} on ${day}`,
            onClick,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            },
          }
        : {})}
    >
      <div data-testid={`slot-${day}-${meal}`} style={inner}>
        {entry ? (
          <>
            {entry.recipe.imageUrl ? (
              <div
                style={{
                  ...thumb,
                  backgroundImage: `url(${resolveImageUrl(entry.recipe.imageUrl)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            ) : null}
            <div style={title}>{entry.recipe.title}</div>
            {onRemove ? (
              <button
                type="button"
                aria-label={`Remove ${entry.recipe.title}`}
                style={removeButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove()
                }}
              >
                ×
              </button>
            ) : null}
          </>
        ) : (
          <span aria-hidden="true" style={plus}>
            +
          </span>
        )}
      </div>
    </div>
  )
}

const cell: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: 10,
  minHeight: 64,
  display: 'flex',
}

const inner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: 1,
  minWidth: 0,
}

const thumb: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  flexShrink: 0,
}

const title: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13.5,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const plus: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--muted)',
  opacity: 0.7,
}

const removeButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 999,
  width: 24,
  height: 24,
  lineHeight: 1,
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface2)',
}
