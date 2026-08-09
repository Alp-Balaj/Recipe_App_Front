// ─────────────────────────────────────────────────────────────────────────
// The desktop preview pane of the follow list. Renders the SHARED
// ProfileSummary plus a three-recipe strip, so browsing a follow list does
// not cost a round trip to each profile and back.
//
// The strip's tiles are not recipe links: opening the recipe canvas from
// here would need this route added to AppShell's backdrop table. They lead
// to the same place the explicit link does — the cook's profile.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { ApiError } from '@/api/client'
import ProfileSummary from '@/components/profile/ProfileSummary'
import StateBlock from '@/components/ui/StateBlock'
import { useUserProfile, useUserRecipes } from '@/hooks/useUserProfile'

interface Props {
  /** The selected cook, or null when the list has no selection yet. */
  userId: string | null
}

export default function FollowPreviewPane({ userId }: Props) {
  const { data: profile, isLoading, isError, error, refetch } = useUserProfile(userId ?? undefined)
  const { data: recipePages } = useUserRecipes(userId ?? undefined)

  if (!userId) {
    return (
      <div style={panel}>
        <StateBlock
          title="Pick a cook"
          body="Select someone to see their profile without leaving this list."
        />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={panel}>
        <StateBlock title="Loading…" />
      </div>
    )
  }

  if (isError || !profile) {
    const gone = error instanceof ApiError && error.status === 404
    return (
      <div style={panel}>
        <StateBlock
          title={gone ? 'This cook is no longer available' : "Couldn't load this profile"}
          action={gone ? undefined : { label: 'Try again', onClick: () => refetch() }}
        />
      </div>
    )
  }

  const recipes = (recipePages?.pages ?? []).flatMap((p) => p.items).slice(0, 3)

  return (
    <div style={panel}>
      <ProfileSummary profile={profile} size="pane" />

      {recipes.length > 0 && (
        <>
          <div style={stripLabel}>Recipes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {recipes.map((r) => (
              <Link key={r.id} to={`/users/${profile.id}`} style={tile} aria-label={r.title}>
                {r.imageUrl ? (
                  <img src={r.imageUrl} alt="" style={tileImg} />
                ) : (
                  <span style={tileFallback}>{r.title.slice(0, 1).toUpperCase()}</span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      <div style={{ textAlign: 'right', marginTop: 12 }}>
        <Link to={`/users/${profile.id}`} style={fullLink}>
          View full profile →
        </Link>
      </div>
    </div>
  )
}

const panel: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 18,
  padding: 18,
}

const stripLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  margin: '4px 0 8px',
}

const tile: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  aspectRatio: '1 / 1',
  borderRadius: 11,
  overflow: 'hidden',
  background: 'var(--surface2)',
  textDecoration: 'none',
}

const tileImg: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' }

const tileFallback: CSSProperties = { fontSize: 20, fontWeight: 800, color: 'var(--muted)' }

const fullLink: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
}
