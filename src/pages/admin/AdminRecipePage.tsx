// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream FE-4, Task 18) — the read-only admin recipe view.
// Reached from the reports queue's "View recipe" link (or directly, by id).
// Shows the moderation-relevant facts and offers exactly the action the
// recipe's current state allows: Hide when live, Restore when hidden.
// Mutations run through useAdminMutation() like every other admin surface;
// on success we navigate(-1) — back to wherever the admin came from, usually
// the reports queue.
// ─────────────────────────────────────────────────────────────────────────

import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { ApiError } from '@/api/client'
import { getAdminRecipe, hideRecipe, restoreRecipe } from '@/api/admin'
import StateBlock from '@/components/ui/StateBlock'
import { timeAgo } from '@/lib/time'
import { alertStyle, linkBtn, mutedNote, useAdminMutation } from './adminShared'

export default function AdminRecipePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { mutate, isPending, error } = useAdminMutation()

  const recipeQuery = useQuery({
    queryKey: queryKeys.admin.recipe(id ?? ''),
    queryFn: () => getAdminRecipe(id ?? ''),
    enabled: !!id,
  })

  if (recipeQuery.isLoading) {
    return <StateBlock title="Loading recipe…" body="Fetching the admin view." />
  }

  if (recipeQuery.isError) {
    if (recipeQuery.error instanceof ApiError && recipeQuery.error.status === 404) {
      return (
        <StateBlock
          title="Recipe not found"
          body="This recipe doesn't exist, or was already removed."
          action={{ label: 'Back to reports', onClick: () => navigate('/admin/reports') }}
        />
      )
    }
    return (
      <StateBlock
        title="Couldn't load this recipe"
        body="Something went wrong reaching the kitchen. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => recipeQuery.refetch() }}
      />
    )
  }

  const recipe = recipeQuery.data
  if (!recipe) {
    return <div style={mutedNote}>Recipe not found.</div>
  }

  const stateBanner = recipe.isDeleted
    ? 'Hidden by moderation'
    : recipe.visibility !== 'Public'
      ? 'Private recipe — visible to you as admin'
      : null

  const handleHide = () => {
    const reason = window.prompt('Reason for hiding this recipe?')
    if (reason === null) return // cancelled
    mutate(() => hideRecipe(recipe.id, reason || undefined).then(() => navigate(-1)))
  }

  const handleRestore = () => {
    mutate(() => restoreRecipe(recipe.id).then(() => navigate(-1)))
  }

  return (
    <div>
      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}

      {stateBanner && (
        <div role="status" style={stateBannerStyle}>
          {stateBanner}
        </div>
      )}

      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{recipe.title}</div>

      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6 }}>
        By{' '}
        <Link to={`/admin/users/${recipe.author.id}`} style={linkBtn}>
          {recipe.author.username}
        </Link>{' '}
        · {timeAgo(recipe.createdAt)}
      </div>

      {recipe.description && (
        <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 12, overflowWrap: 'anywhere' }}>
          {recipe.description}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {!recipe.isDeleted && (
          <button disabled={isPending} onClick={handleHide} style={dangerBtn}>
            Hide recipe
          </button>
        )}
        {recipe.isDeleted && (
          <button disabled={isPending} onClick={handleRestore} style={ghostBtn}>
            Restore
          </button>
        )}
      </div>
    </div>
  )
}

// ── Styles (page-only; not shared, so they stay local rather than in adminShared) ──

const stateBannerStyle = {
  fontSize: 13,
  color: 'var(--accent)',
  background: 'var(--accent-soft)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  marginBottom: 14,
} as const

const smallBtnBase = {
  cursor: 'pointer',
  borderRadius: 10,
  padding: '7px 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
} as const

const ghostBtn = {
  ...smallBtnBase,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
} as const

const dangerBtn = {
  ...smallBtnBase,
  border: 'none',
  background: '#d9534f',
  color: '#fff',
} as const
