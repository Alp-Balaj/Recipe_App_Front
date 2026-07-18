// ─────────────────────────────────────────────────────────────────────────
// A browse-style RecipeCard wired into the social layer (social-feed cp06).
//
// This is the ONE place non-feed list surfaces (BrowsePage, the profile
// Saved tab) attach like/save: interaction state comes from the decision-I3
// SocialEnvelope seam (feed-cache hits, else the caller's `seed`, else
// unknown) and both toggles go through the shared useSocialMutations —
// no forked mutation logic per surface.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeResponse } from '@/api/types'
import RecipeCard from '@/components/RecipeCard'
import { useSocialEnvelope, type SocialEnvelope } from '@/hooks/useSocialEnvelope'
import { useSocialMutations } from '@/hooks/useSocialMutations'

interface SocialRecipeCardProps {
  recipe: RecipeResponse
  onOpen: () => void
  /**
   * Cache-known facts for the first envelope derivation (e.g. the saved tab
   * KNOWS savedByMe is true — the recipe came from the saved list).
   */
  seed?: Partial<SocialEnvelope>
}

export default function SocialRecipeCard({ recipe, onOpen, seed }: SocialRecipeCardProps) {
  const envelope = useSocialEnvelope(recipe.id, seed)
  const { toggleLike, toggleSave } = useSocialMutations()

  return (
    <RecipeCard
      recipe={recipe}
      variant="browse"
      onOpen={onOpen}
      social={{
        likeCount: envelope.likeCount,
        likedByMe: envelope.likedByMe,
        savedByMe: envelope.savedByMe,
        onToggleLike: (next) => toggleLike.mutate({ recipeId: recipe.id, next }),
        onToggleSave: (next) => toggleSave.mutate({ recipeId: recipe.id, next }),
      }}
    />
  )
}
