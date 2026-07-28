// ─────────────────────────────────────────────────────────────────────────
// Recipe picker for a plan slot (meal-planning-ui plan, Task 6).
//
// Reuses the shared <Modal> primitive (dialog semantics, focus trap, Escape)
// and the shared useInfiniteRecipes core with queryKeys.recipes.list() — the
// same page of GET /recipes the browse surface reads, so opening the picker
// usually paints from cache.
//
// RecipeListRow was considered and rejected: its props are the profile owner
// footer (Edit / Share / Delete), which has no meaning here. The rows below
// are the same card idiom, minus that footer.
// ─────────────────────────────────────────────────────────────────────────

import { type CSSProperties, type KeyboardEvent } from 'react'
import { queryKeys } from '@/api/queryKeys'
import { useInfiniteRecipes } from '@/hooks/useInfiniteRecipes'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'
import Modal from '@/components/ui/Modal'
import StateBlock from '@/components/ui/StateBlock'

const PAGE_SIZE = 20

interface Props {
  open: boolean
  onClose: () => void
  onPick: (recipeId: string) => void
}

export default function RecipePickerModal({ open, onClose, onPick }: Props) {
  if (!open) return null
  return <PickerSheet onClose={onClose} onPick={onPick} />
}

/**
 * Split out so the list query only mounts (and only fetches) while the picker
 * is actually open — the hook can then live at the top of this component
 * without a conditional-hook problem.
 */
function PickerSheet({ onClose, onPick }: { onClose: () => void; onPick: (recipeId: string) => void }) {
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteRecipes({
    queryKey: queryKeys.recipes.list(),
    pageSize: PAGE_SIZE,
  })

  const recipes = (data?.pages ?? []).flatMap((p) => p.items)

  return (
    <Modal onClose={onClose} label="Choose a recipe" variant="sheet">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h2 style={{ flex: 1, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
          Choose a recipe
        </h2>
        <button type="button" style={closeButton} onClick={onClose}>
          Cancel
        </button>
      </div>

      {isLoading && <StateBlock title="Loading recipes…" />}
      {!isLoading && isError && (
        <StateBlock title="Couldn't load recipes" body="Check your connection and try again." />
      )}
      {!isLoading && !isError && recipes.length === 0 && (
        <StateBlock title="No recipes yet" body="Create a recipe first, then plan it into your week." />
      )}

      {!isLoading && !isError && recipes.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              role="button"
              tabIndex={0}
              aria-label={recipe.title}
              style={row}
              onClick={() => onPick(recipe.id)}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onPick(recipe.id)
                }
              }}
            >
              <div
                style={{
                  ...thumb,
                  ...(recipe.imageUrl
                    ? {
                        backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : { background: gradientFor(recipe.id || recipe.title) }),
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={rowTitle}>{recipe.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
                  ◷ {formatMinutes(recipe.totalTimeMinutes)}
                  {recipe.cuisineType ? ` · ${recipe.cuisineType}` : ''}
                </div>
              </div>
            </div>
          ))}

          {hasNextPage && (
            <button
              type="button"
              style={moreButton}
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              {isFetchingNextPage ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 13,
  cursor: 'pointer',
  minWidth: 0,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: 12,
}

const thumb: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  flexShrink: 0,
}

const rowTitle: CSSProperties = {
  fontSize: 14.5,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const closeButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface2)',
}

const moreButton: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--surface2)',
}
