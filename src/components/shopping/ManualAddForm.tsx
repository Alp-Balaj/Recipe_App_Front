// ─────────────────────────────────────────────────────────────────────────
// "Add something of your own" (week/shopping rework, Task 6).
//
// Lifted almost unchanged from the retired page: a manual row is still an
// ingredient and a free-text quantity. What changed is invisible here — the row
// is now scoped to a WEEK, and the page supplies which one, because this form has
// no business knowing about scopes.
//
// The fields clear only on success, so a failed add leaves what you typed where
// you can retry it.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties, type FormEvent } from 'react'

// Local, deliberately NOT exported: nothing outside this file consumes it (week/
// shopping rework fix wave — it was exported and never imported).
interface ManualAddFormProps {
  /** Resolves when the row is stored; rejects to keep the fields for a retry. */
  onAdd: (item: { ingredient: string; quantity: string }) => Promise<unknown>
  isPending: boolean
  isError: boolean
}

export default function ManualAddForm({ onAdd, isPending, isError }: ManualAddFormProps) {
  const [ingredient, setIngredient] = useState('')
  const [quantity, setQuantity] = useState('')

  const canAdd = ingredient.trim().length > 0 && quantity.trim().length > 0 && !isPending

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canAdd) return
    onAdd({ ingredient: ingredient.trim(), quantity: quantity.trim() })
      .then(() => {
        setIngredient('')
        setQuantity('')
      })
      // The page banners the failure (isError); swallowing here only stops the
      // rejection becoming an unhandled one.
      .catch(() => {})
  }

  return (
    <>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label="Ingredient"
          placeholder="Ingredient"
          value={ingredient}
          onChange={(event) => setIngredient(event.target.value)}
          style={input}
        />
        <input
          aria-label="Quantity"
          placeholder="Quantity"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          style={{ ...input, flex: '0 1 110px' }}
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

const input: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
}

const addButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 12,
  padding: '10px 16px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}
