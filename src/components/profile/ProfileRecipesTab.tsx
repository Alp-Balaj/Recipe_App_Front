// ─────────────────────────────────────────────────────────────────────────
// The profile Recipes tab — the caller's own recipes as list-rows (design
// 3d/4a) with inline Edit / Share / Delete. This is the My-Recipes surface
// folded into the profile: same data path (GET /recipes filtered client-side
// on createdByUserId, so the shared write-mutation invalidations keep it
// fresh) and the same edit/delete flows as MyRecipesPage, just rendered as the
// compact rows the redesign calls for. `columns` drives the grid (1 on mobile,
// 2 in the desktop content pane).
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import type { RecipeResponse } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import Modal from '@/components/ui/Modal'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useInfiniteRecipes } from '@/hooks/useInfiniteRecipes'
import { useDeleteRecipe, useUpdateRecipe } from '@/hooks/useRecipeMutations'
import { RecipeForm, recipeResponseToFormValues } from '@/pages/RecipeFormPage.shared'
import RecipeListRow from './RecipeListRow'

const PAGE_LIMIT = 50
const ERROR_COLOR = '#d9534f'

export default function ProfileRecipesTab({ columns = 1 }: { columns?: number }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const openRecipe = useOpenRecipe()
  const userId = user?.userId

  const [editing, setEditing] = useState<RecipeResponse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RecipeResponse | null>(null)
  const [banner, setBanner] = useState<{ text: string; tone: 'info' | 'error' } | null>(null)

  const updateRecipe = useUpdateRecipe()
  const deleteRecipe = useDeleteRecipe()

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteRecipes({ queryKey: queryKeys.recipes.mine(), pageSize: PAGE_LIMIT })

  const mine = useMemo(() => {
    const all = (data?.pages ?? []).flatMap((p) => p.items)
    return userId ? all.filter((r) => r.createdByUserId === userId) : []
  }, [data, userId])

  const handleShare = async (r: RecipeResponse) => {
    const url = `${window.location.origin}/recipes/${r.id}`
    try {
      await navigator.clipboard?.writeText(url)
      setBanner({ text: 'Link copied to clipboard.', tone: 'info' })
    } catch {
      setBanner({ text: 'Could not copy the link.', tone: 'error' })
    }
  }

  const runDelete = async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    setConfirmDelete(null)
    setBanner(null)
    try {
      await deleteRecipe.mutateAsync(target.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setBanner({ text: 'That recipe was already removed.', tone: 'error' })
      } else if (err instanceof ApiError && err.status === 403) {
        setBanner({ text: "You don't have permission to delete that recipe.", tone: 'error' })
      } else {
        setBanner({ text: 'Could not delete the recipe. Please try again.', tone: 'error' })
      }
    }
  }

  const handleEditError = (err: unknown): boolean => {
    if (err instanceof ApiError && err.status === 404) {
      setBanner({ text: 'That recipe no longer exists.', tone: 'error' })
      setEditing(null)
      refetch()
      return true
    }
    if (err instanceof ApiError && err.status === 403) {
      setBanner({ text: "You don't have permission to edit that recipe.", tone: 'error' })
      setEditing(null)
      return true
    }
    return false
  }

  return (
    <div>
      {banner && (
        <div
          role="alert"
          style={{
            fontSize: 13,
            color: banner.tone === 'error' ? ERROR_COLOR : 'var(--accent)',
            background: banner.tone === 'error' ? 'rgba(217, 83, 79, 0.10)' : 'var(--accent-soft)',
            border: `1px solid ${banner.tone === 'error' ? 'rgba(217, 83, 79, 0.35)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 14,
          }}
        >
          {banner.text}
        </div>
      )}

      {isLoading && <StateBlock title="Loading your recipes…" />}

      {isError && !isLoading && (
        <StateBlock title="Couldn't load your recipes." action={{ label: 'Retry', onClick: () => refetch() }} />
      )}

      {!isLoading && !isError && mine.length === 0 && (
        <StateBlock
          title="No recipes yet"
          body="Everything you post shows up here."
          action={{ label: 'Create your first', onClick: () => navigate('/recipes/new') }}
        />
      )}

      {mine.length > 0 && (
        // minmax(0, 1fr), NOT 1fr. `1fr` is shorthand for `minmax(auto, 1fr)`,
        // and that `auto` minimum is the grid item's MIN-CONTENT width — which a
        // `white-space: nowrap` title makes as wide as the entire title. The
        // track then refuses to be narrower than the longest recipe name and the
        // row's own min-width:0 never gets a chance to ellipsise. Measured on a
        // 390px phone: card 492px, title 436px, page scrollWidth 613. The `0`
        // floor is the entire fix.
        <div
          data-testid="recipes-grid"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12 }}
        >
          {mine.map((r) => (
            <RecipeListRow
              key={r.id}
              recipe={r}
              onOpen={() => openRecipe(r.id)}
              onEdit={() => {
                setBanner(null)
                setEditing(r)
              }}
              onShare={() => handleShare(r)}
              onDelete={() => {
                setBanner(null)
                setConfirmDelete(r)
              }}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 4px' }}>
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Edit overlay — the shared RecipeForm in a sheet (as MyRecipesPage). */}
      {editing && (
        <Modal variant="sheet" label="Edit recipe" onClose={() => setEditing(null)}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>Edit recipe</div>
          <RecipeForm
            defaultValues={recipeResponseToFormValues(editing)}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            submit={(body) => updateRecipe.mutateAsync({ id: editing.id, body })}
            onSuccess={() => {
              setEditing(null)
              setBanner(null)
            }}
            onCancel={() => setEditing(null)}
            onError={handleEditError}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Modal variant="center" label="Delete recipe" onClose={() => setConfirmDelete(null)}>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--cardsh)',
              borderRadius: 18,
              padding: '20px 18px',
            }}
          >
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Delete this recipe?</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 16 }}>
              “{confirmDelete.title}” will be removed from your recipes and Discover. This can't be undone here.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={runDelete}
                disabled={deleteRecipe.isPending}
                style={{
                  flex: 1,
                  cursor: deleteRecipe.isPending ? 'default' : 'pointer',
                  border: 'none',
                  borderRadius: 13,
                  padding: '11px 12px',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  background: ERROR_COLOR,
                  color: '#fff',
                  opacity: deleteRecipe.isPending ? 0.6 : 1,
                }}
              >
                {deleteRecipe.isPending ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: '11px 18px',
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  borderRadius: 13,
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  background: 'var(--surface2)',
                  color: 'var(--muted)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const loadMoreBtn: React.CSSProperties = {
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
