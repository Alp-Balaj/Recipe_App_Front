// ─────────────────────────────────────────────────────────────────────────
// One slot of the week grid (meal-planning-ui plan, Task 5) — a single
// (day, meal) cell, either filled with its planned recipe or an empty "+"
// affordance.
//
// Test hooks: the outer cell carries `data-testid="slot-cell"` (count the
// grid), the inner content carries `data-testid="slot-<Day>-<Meal>"` (address
// one slot) — an element can only carry one data-testid, hence the two levels.
//
// `onClick` / `onRemove` were declared by Task 5 and are wired by Task 6,
// which additionally adds the move affordance: `onMove` (start a move from
// this filled slot) and `isMoving` (this slot's entry is the one in flight).
// No drag-and-drop library may be added, so a move is select-then-place.
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
  /** Start a move from this (filled) slot — renders the "Move" affordance. */
  onMove?: () => void
  /** This slot's entry is the one currently being moved. */
  isMoving?: boolean
}

export default function SlotCell({ day, meal, entry, onClick, onRemove, onMove, isMoving = false }: Props) {
  const interactive = Boolean(onClick)

  return (
    <div
      data-testid="slot-cell"
      style={{
        ...cell,
        cursor: interactive ? 'pointer' : 'default',
        ...(isMoving ? { borderColor: 'var(--accent)', boxShadow: 'none' } : {}),
      }}
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
            {onMove ? (
              <button
                type="button"
                aria-label={`Move ${entry.recipe.title}`}
                style={moveButton}
                onClick={(e) => {
                  e.stopPropagation()
                  onMove()
                }}
              >
                {isMoving ? 'Moving…' : 'Move'}
              </button>
            ) : null}
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

const moveButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '4px 9px',
  fontFamily: 'inherit',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface2)',
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
