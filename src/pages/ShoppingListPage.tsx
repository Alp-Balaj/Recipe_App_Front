// ─────────────────────────────────────────────────────────────────────────
// Shopping-list surface (/shopping-list) — meal-planning-ui plan, Task 7.
//
// The single per-user list (meal-planning-v1-semantics #3): one keyset-paged
// column of rows, each a checkbox whose accessible name is the ingredient, plus
// a manual-add form and a per-row delete. Ticking PATCHes an explicit true or
// false — never a toggle — so a double-tap can't corrupt anything; the optimism
// lives in useShoppingListMutations, this page only renders the cache.
//
// Paging follows the BrowsePage idiom: a "Load more" button while hasNextPage,
// and "That's everything." once the last page is in.
//
// Task 8 adds generate-from-plan above the list. Reachable by URL only until
// Task 9 adds the nav entry.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties, type FormEvent } from 'react'
import type { ShoppingListItem } from '@/api/mealPlans'
import { useShoppingList, useShoppingListMutations } from '@/hooks/useShoppingList'
import StateBlock from '@/components/ui/StateBlock'

const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: 14,
}

const inputStyle: CSSProperties = {
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

const addButtonStyle: CSSProperties = {
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

const loadMoreBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}

const deleteBtn: CSSProperties = {
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

export default function ShoppingListPage() {
  const { data, isLoading, error, hasNextPage, fetchNextPage, isFetchingNextPage, isFetching } = useShoppingList()
  const { setPurchased, addItem, removeItem } = useShoppingListMutations()

  const [ingredient, setIngredient] = useState('')
  const [quantity, setQuantity] = useState('')

  const items = data?.pages.flatMap((page) => page.items) ?? []
  const canAdd = ingredient.trim().length > 0 && quantity.trim().length > 0 && !addItem.isPending

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canAdd) return
    addItem.mutate(
      { ingredient: ingredient.trim(), quantity: quantity.trim() },
      {
        onSuccess: () => {
          setIngredient('')
          setQuantity('')
        },
      },
    )
  }

  return (
    <div className="scroll" style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Shopping list</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 18px' }}>
        Everything you still need to buy, in one place.
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          aria-label="Ingredient"
          placeholder="Ingredient"
          value={ingredient}
          onChange={(e) => setIngredient(e.target.value)}
          style={inputStyle}
        />
        <input
          aria-label="Quantity"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          style={{ ...inputStyle, flex: '0 1 110px' }}
        />
        <button type="submit" disabled={!canAdd} style={{ ...addButtonStyle, opacity: canAdd ? 1 : 0.5 }}>
          {addItem.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {addItem.isError && (
        <div role="status" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Couldn't add that item. Try again.
        </div>
      )}

      {isLoading && <StateBlock title="Loading your list…" />}

      {!isLoading && error && (
        <StateBlock title="Couldn't load your list" body="Check your connection and try again." />
      )}

      {!isLoading && !error && items.length === 0 && (
        <StateBlock
          title="Nothing on your list yet."
          body="Add items by hand, or generate them from a week's meal plan."
        />
      )}

      {!isLoading && !error && items.length > 0 && (
        <>
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                onToggle={(isPurchased) => setPurchased.mutate({ id: item.id, isPurchased })}
                onRemove={() => removeItem.mutate(item.id)}
              />
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
            {hasNextPage ? (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            ) : (
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {isFetching ? 'Loading…' : "That's everything."}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One row. The checkbox carries the ingredient as its accessible name — the
 * visible name sits in a sibling span, so a label wrapper would fold the
 * quantity into that name too.
 */
function Row({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingListItem
  onToggle: (isPurchased: boolean) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px' }}>
      <input
        type="checkbox"
        aria-label={item.ingredient}
        checked={item.isPurchased}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ width: 17, height: 17, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 600,
          color: item.isPurchased ? 'var(--muted)' : 'var(--text)',
          textDecoration: item.isPurchased ? 'line-through' : 'none',
        }}
      >
        {item.ingredient}
      </span>
      <span
        style={{
          flexShrink: 0,
          fontSize: 12.5,
          color: 'var(--muted)',
          textDecoration: item.isPurchased ? 'line-through' : 'none',
        }}
      >
        {item.quantity}
      </span>
      <button type="button" aria-label={`Remove ${item.ingredient}`} onClick={onRemove} style={deleteBtn}>
        ×
      </button>
    </div>
  )
}
