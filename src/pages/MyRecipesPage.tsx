// My-recipes page (/recipes/mine) — checkpoint 06, lane B.
//
// v1 lists the caller's own recipes by filtering the paged GET /recipes result
// client-side on createdByUserId (the auth store carries userId). GET /recipes
// already returns full RecipeResponse objects, so edit prefills straight from
// the list item — no separate GET /recipes/{id} round-trip is needed. If this
// client-side filtering proves too coarse at scale, the flagged ?mine=true
// backend micro-addition is the sanctioned next step (see the plan).
//
// Edit reuses the shared RecipeForm in an overlay (there is no /recipes/:id/edit
// route — the router is frozen), submitting PUT /recipes/{id}; 403 and 404 are
// surfaced distinctly. Delete asks for confirmation, then soft-deletes.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch, ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import type { RecipeListResponse, RecipeResponse } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import { useUpdateRecipe, useDeleteRecipe } from '@/hooks/useRecipeMutations'
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

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: queryKeys.recipes.mine(),
      queryFn: ({ pageParam }) =>
        apiFetch<RecipeListResponse>('/recipes', {
          query: { cursor: pageParam ?? undefined, limit: PAGE_LIMIT },
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
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

      {isLoading && <StateNote>Loading your recipes…</StateNote>}

      {isError && !isLoading && (
        <StateNote>
          Couldn't load your recipes.{' '}
          <button onClick={() => refetch()} style={linkButtonStyle}>
            Retry
          </button>
        </StateNote>
      )}

      {!isLoading && !isError && mine.length === 0 && (
        <StateNote>
          You haven't posted any recipes yet.{' '}
          <button onClick={() => navigate('/recipes/new')} style={linkButtonStyle}>
            Create your first
          </button>
        </StateNote>
      )}

      {mine.map((r) => (
        <MyRecipeCard
          key={r.id}
          recipe={r}
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
        <Overlay onBackdrop={() => setEditing(null)}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 16 }}>
            Edit recipe
          </div>
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
        </Overlay>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Overlay onBackdrop={() => setConfirmDelete(null)} center>
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
        </Overlay>
      )}
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

const linkButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 700,
  color: 'var(--accent)',
}

function StateNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        padding: '22px 18px',
        fontSize: 14.5,
        color: 'var(--muted)',
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  )
}

function MyRecipeCard({
  recipe,
  onOpen,
  onEdit,
  onDelete,
}: {
  recipe: RecipeResponse
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <div
        onClick={onOpen}
        role="button"
        style={{ cursor: 'pointer' }}
      >
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            style={{ display: 'block', width: '100%', height: 104, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              height: 104,
              background: 'linear-gradient(135deg, var(--surface2), var(--chipbg))',
            }}
          />
        )}

        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{recipe.title}</div>
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 9px',
                borderRadius: 999,
                background: 'var(--chipbg)',
                color: 'var(--chipcol)',
              }}
            >
              {recipe.visibility === 'FriendsOnly' ? 'Friends' : recipe.visibility}
            </span>
          </div>

          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45, margin: '4px 0 12px' }}>
            {recipe.description}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 14,
              fontSize: 12.5,
              color: 'var(--muted)',
              paddingBottom: 12,
              borderBottom: '1px solid var(--hair)',
            }}
          >
            <span>◷ {recipe.totalTimeMinutes} min</span>
            {recipe.caloriesPerServing != null && <span>♨ {recipe.caloriesPerServing} kcal</span>}
            <span>▤ {recipe.ingredients.length}</span>
          </div>
        </div>
      </div>

      {/* Owner affordances — this page only ever shows the caller's recipes. */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px 14px' }}>
        <button
          onClick={onEdit}
          style={{
            cursor: 'pointer',
            border: '1px solid var(--border)',
            borderRadius: 11,
            padding: '8px 14px',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--surface2)',
            color: 'var(--text)',
          }}
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          style={{
            cursor: 'pointer',
            border: '1px solid var(--border)',
            borderRadius: 11,
            padding: '8px 14px',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            background: 'var(--surface2)',
            color: ERROR_COLOR,
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

function Overlay({
  children,
  onBackdrop,
  center = false,
}: {
  children: React.ReactNode
  onBackdrop: () => void
  center?: boolean
}) {
  return (
    <div
      onClick={onBackdrop}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--backdrop)',
        display: 'flex',
        alignItems: center ? 'center' : 'flex-start',
        justifyContent: 'center',
        padding: center ? 18 : '0',
        zIndex: 10,
        overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="scroll"
        style={
          center
            ? { width: '100%', maxWidth: 380 }
            : {
                width: '100%',
                minHeight: '100%',
                background: 'var(--bg)',
                padding: '46px 18px 24px',
              }
        }
      >
        {children}
      </div>
    </div>
  )
}
