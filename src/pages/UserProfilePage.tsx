// ─────────────────────────────────────────────────────────────────────────
// /users/:id — the public profile (social-feed cp06).
//
// Avatar block (initials fallback, shared Avatar), bio, cookingRank, the
// follower/following/recipe counts, an optimistic follow/unfollow button
// (followedByMe via the shared useSocialMutations), and the 3-column
// Instagram-style recipe grid over GET /users/{id}/recipes (keyset).
// recipeCount counts only recipes the CALLER can see, so it matches the grid.
// Own profile: the follow button hides (self-follow is a backend 400) and a
// link points at /profile instead.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties, type KeyboardEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { RecipeResponse } from '@/api/types'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import ProfileSummary from '@/components/profile/ProfileSummary'
import { isNotFound } from '@/hooks/useRecipe'
import { useUserProfile, useUserRecipes } from '@/hooks/useUserProfile'
import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'

const PAGE_STYLE = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 16px',
} as const

export default function UserProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const openRecipe = useOpenRecipe()

  const { data: profile, isLoading, isError, error, refetch } = useUserProfile(id)
  const {
    data: recipesData,
    isLoading: recipesLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useUserRecipes(id)

  const recipes = useMemo(() => {
    const seen = new Set<string>()
    const out: RecipeResponse[] = []
    for (const page of recipesData?.pages ?? []) {
      for (const r of page.items) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          out.push(r)
        }
      }
    }
    return out
  }, [recipesData])

  if (isLoading) {
    return <StateBlock variant="page" title="Loading profile…" body="Fetching this cook's kitchen." />
  }

  if (isError && isNotFound(error)) {
    return (
      <StateBlock
        variant="page"
        title="User not found"
        body="This account doesn't exist or was removed."
        action={{ label: 'Back to feed', onClick: () => navigate('/feed', { replace: true }) }}
      />
    )
  }

  if (isError || !profile) {
    return (
      <StateBlock
        variant="page"
        title="Couldn't load this profile"
        body="Something went wrong reaching the kitchen. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => refetch() }}
      />
    )
  }

  return (
    <div className="scroll" style={PAGE_STYLE}>
      {/* Back affordance (deep links with no in-app history → feed). */}
      <button
        onClick={() => {
          if (window.history.state?.idx > 0) navigate(-1)
          else navigate('/feed', { replace: true })
        }}
        aria-label="Back"
        style={backBtn}
      >
        ←
      </button>

      <ProfileSummary profile={profile} size="page" />

      {/* Recipe grid — 3 columns, the Instagram shape. */}
      <div style={gridLabel}>Recipes</div>
      {recipesLoading ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading recipes…</div>
      ) : recipes.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>No recipes to show yet.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {recipes.map((r) => (
              <GridTile key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />
            ))}
          </div>
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px' }}>
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function GridTile({ recipe, onOpen }: { recipe: RecipeResponse; onOpen: () => void }) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={recipe.title}
      onClick={onOpen}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{
        position: 'relative',
        aspectRatio: '1',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        ...(recipe.imageUrl
          ? {
              backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { background: gradientFor(recipe.id || recipe.title) }),
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '14px 8px 6px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.62), transparent)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {recipe.title}
      </span>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const backBtn: CSSProperties = {
  border: 'none',
  background: 'var(--surface2)',
  color: 'var(--text)',
  width: 34,
  height: 34,
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 14,
}

const gridLabel: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  fontWeight: 700,
  margin: '20px 0 8px',
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
