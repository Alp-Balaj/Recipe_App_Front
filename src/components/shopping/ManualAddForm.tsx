// ─────────────────────────────────────────────────────────────────────────
// "Add something of your own" (shop redesign — restyled, same contract).
//
// It is now a DASHED PLACEHOLDER first and a form second: at rest it is one line
// of muted text that says what it would do, and it only becomes two inputs once
// you touch it. That is the design's shape, and it is right for the surface —
// this is a list you read, and a permanently-open form at the top of it is a
// permanent suggestion that something is missing.
//
// What has not changed: a manual row is an ingredient plus a free-text quantity,
// the page supplies which week it lands in, and the fields clear only on success
// so a failed add leaves what you typed where you can retry it.
//
// Enter commits — the hint says so, and the form's submit is what honours it.
// Escape closes an empty draft, because a placeholder you cannot dismiss is a
// worse default than one that never opened.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties, type FormEvent } from 'react'

interface ManualAddFormProps {
  /** Resolves when the row is stored; rejects to keep the fields for a retry. */
  onAdd: (item: { ingredient: string; quantity: string }) => Promise<unknown>
  isPending: boolean
  isError: boolean
  compact?: boolean
}

export default function ManualAddForm({ onAdd, isPending, isError, compact = false }: ManualAddFormProps) {
  const [open, setOpen] = useState(false)
  const [ingredient, setIngredient] = useState('')
  const [quantity, setQuantity] = useState('')

  // The quantity is optional here, unlike the old form's two required fields: on a
  // list you are writing in a shop doorway, "Bin bags" is a complete thought. The
  // API wants a string, so an empty one becomes a dash rather than a validation error.
  const canAdd = ingredient.trim().length > 0 && !isPending

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canAdd) return
    onAdd({ ingredient: ingredient.trim(), quantity: quantity.trim() || '—' })
      .then(() => {
        setIngredient('')
        setQuantity('')
      })
      // The page banners the failure (isError); swallowing here only stops the
      // rejection becoming an unhandled one.
      .catch(() => {})
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ ...placeholder(compact), width: '100%' }}>
        <span style={{ fontSize: compact ? 14 : 15, fontWeight: 800 }}>+</span>
        <span style={{ fontSize: compact ? 13.5 : 14, fontWeight: 700, flex: 1, textAlign: 'left' }}>
          Add something of your own
        </span>
        {!compact && <span style={{ fontSize: 12, color: 'var(--navidle)' }}>Enter to add</span>}
      </button>
    )
  }

  return (
    <>
      <form onSubmit={onSubmit} style={{ ...placeholder(compact), gap: 8 }}>
        <input
          aria-label="Ingredient"
          placeholder="Add something of your own"
          value={ingredient}
          autoFocus
          onChange={(event) => setIngredient(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !ingredient && !quantity) setOpen(false)
          }}
          style={input}
        />
        <input
          aria-label="Quantity"
          placeholder="Amount"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          style={{ ...input, flex: '0 1 96px' }}
        />
        <button type="submit" disabled={!canAdd} style={{ ...addButton, opacity: canAdd ? 1 : 0.5 }}>
          {isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {isError && (
        <div role="status" style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>
          Couldn't add that item. Try again.
        </div>
      )}
    </>
  )
}

// Dashed, and filled with the muted control tint rather than a surface: it is an
// invitation, not a card. The dash is what stops it reading as a row you forgot
// to tick.
const placeholder = (compact: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: compact ? 10 : 11,
  borderRadius: compact ? 12 : 13,
  padding: compact ? '10px 12px' : '12px 15px',
  background: 'var(--surface2)',
  border: '1px dashed var(--navidle)',
  color: 'var(--muted)',
  fontFamily: 'inherit',
  cursor: 'pointer',
})

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'inherit',
  fontWeight: 700,
  outline: 'none',
}

const addButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 9,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
}
