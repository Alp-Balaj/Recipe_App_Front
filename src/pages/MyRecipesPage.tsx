// My-recipes page (/recipes/mine) — checkpoint 06, lane B.
//
// v1 lists the caller's own recipes by filtering the paged GET /recipes result
// client-side on createdByUserId (the auth store carries userId). GET /recipes
// already returns full RecipeResponse objects, so edit prefills straight from
// the list item — no separate GET /recipes/{id} round-trip is needed. If this
// client-side filtering proves too coarse at scale, the flagged ?mine=true
// backend micro-addition is the sanctioned next step (see the plan).
//
// Edit reuses the shared RecipeForm in a Modal (there is no /recipes/:id/edit
// route — the router is frozen), submitting PUT /recipes/{id}; 403 and 404 are
// surfaced distinctly. Delete asks for confirmation, then soft-deletes.
//
// Consolidation (fe · consolidation): the recipe card, the loading/error/empty
// blocks, the pagination hook, and the edit/delete overlays are now the shared
// primitives (RecipeCard / StateBlock / useInfiniteRecipes / Modal) rather than
// page-local copies.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import type { RecipeResponse } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { useUpdateRecipe, useDeleteRecipe } from '@/hooks/useRecipeMutations'
import { useInfiniteRecipes } from '@/hooks/useInfiniteRecipes'
import RecipeCard from '@/components/RecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import Modal from '@/components/ui/Modal'
import { RecipeForm, recipeResponseToFormValues } from './RecipeFormPage.shared'

const PAGE_LIMIT = 50

const scrollPageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

const ERROR_COLOR = '#d9534f'

export default function MyRecipesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const userId = user?.userId

  const [editing, setEditing] = useState<RecipeResponse | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<RecipeResponse | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const updateRecipe = useUpdateRecipe()
  const deleteRecipe = useDeleteRecipe()

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteRecipes({
    queryKey: queryKeys.recipes.mine(),
    pageSize: PAGE_LIMIT,
  })

  const mine = useMemo(() => {
    const all = (data?.pages ?? []).flatMap((p) => p.items)
    return userId ? all.filter((r) => r.createdByUserId === userId) : []
  }, [data, userId])

  // ── Delete flow ───────────────────────────────────────────────────────────
  const runDelete = async () => {
    if (!confirmDelete) return
    const target = confirmDelete
    setConfirmDelete(null)
    setBanner(null)
    try {
      await deleteRecipe.mutateAsync(target.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        // Already gone — the refetch on invalidation will drop it anyway.
        setBanner('That recipe was already removed.')
      } else if (err instanceof ApiError && err.status === 403) {
        setBanner("You don't have permission to delete that recipe.")
      } else {
        setBanner('Could not delete the recipe. Please try again.')
      }
    }
  }

  // ── Edit flow: intercept 403/404 distinctly; let 400 map onto fields. ───────
  const handleEditError = (err: unknown): boolean => {
    if (err instanceof ApiError && err.status === 404) {
      setBanner('That recipe no longer exists.')
      setEditing(null)
      refetch()
      return true
    }
    if (err instanceof ApiError && err.status === 403) {
      setBanner("You don't have permission to edit that recipe.")
      setEditing(null)
      return true
    }
    return false
  }

  return (
    <div className="scroll" style={scrollPageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>My recipes</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Everything you've posted</div>
        </div>
        <button
          onClick={() => navigate('/recipes/new')}
          style={{
            cursor: 'pointer',
            border: 'none',
            borderRadius: 12,
            padding: '9px 14px',
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 700,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          ＋ New
        </button>
      </div>

      {banner && (
        <div
          role="alert"
          style={{
            fontSize: 13,
            color: ERROR_COLOR,
            background: 'rgba(217, 83, 79, 0.10)',
            border: '1px solid rgba(217, 83, 79, 0.35)',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          {banner}
        </div>
      )}

      {isLoading && <StateBlock title="Loading your recipes…" />}

      {isError && !isLoading && (
        <StateBlock title="Couldn't load your recipes." action={{ label: 'Retry', onClick: () => refetch() }} />
      )}

      {!isLoading && !isError && mine.length === 0 && (
        <StateBlock
          title="You haven't posted any recipes yet."
          action={{ label: 'Create your first', onClick: () => navigate('/recipes/new') }}
        />
      )}

      {mine.map((r) => (
        <RecipeCard
          key={r.id}
          recipe={r}
          variant="mine"
          onOpen={() => navigate(`/recipes/${r.id}`)}
          onEdit={() => {
            setBanner(null)
            setEditing(r)
          }}
          onDelete={() => {
            setBanner(null)
            setConfirmDelete(r)
          }}
        />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          style={{
            width: '100%',
            marginTop: 4,
            cursor: isFetchingNextPage ? 'default' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: 13,
            padding: '11px 12px',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--surface2)',
            color: 'var(--muted)',
          }}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}

      {/* Edit overlay */}
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
              “{confirmDelete.title}” will be removed from your library and browse. This can't be undone here.
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
