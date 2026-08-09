// ─────────────────────────────────────────────────────────────────────────
// The profile Saved tab — GET /users/me/saved-recipes through the shared
// social layer (social-feed cp06, moved here from ProfileTab in the redesign).
// savedByMe is KNOWN true (these came from the saved list), so it's seeded and
// an unsave drops the card in place.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RecipeResponse } from '@/api/types'
import SocialRecipeCard from '@/components/SocialRecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useSavedRecipes } from '@/hooks/useSavedRecipes'

export default function ProfileSavedTab() {
  const navigate = useNavigate()
  const openRecipe = useOpenRecipe()
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } =
    useSavedRecipes()

  const recipes = useMemo(() => {
    const seen = new Set<string>()
    const out: RecipeResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const r of page.items) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          out.push(r)
        }
      }
    }
    return out
  }, [data])

  if (isLoading) {
    return <StateBlock title="Loading saved recipes…" body="Fetching your bookmarks." />
  }
  if (isError) {
    return (
      <StateBlock
        title="Couldn't load your saved recipes"
        body="Something went wrong reaching the kitchen. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => refetch() }}
      />
    )
  }
  if (recipes.length === 0) {
    return (
      <StateBlock
        title="Nothing saved yet"
        body="Tap the flag on any recipe to keep it here for later."
        action={{ label: 'Browse recipes', onClick: () => navigate('/discover') }}
      />
    )
  }

  return (
    <>
      {recipes.map((r) => (
        <SocialRecipeCard
          key={r.id}
          recipe={r}
          variant="savedRow"
          seed={{ savedByMe: true }}
          onOpen={() => openRecipe(r.id)}
        />
      ))}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 12px' }}>
        {hasNextPage ? (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {isFetching ? 'Loading…' : "That's everything you've saved."}
          </span>
        )}
      </div>
    </>
  )
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
