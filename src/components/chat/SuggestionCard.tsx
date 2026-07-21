import type { RecipeResponse } from '@/api/types'
import RecipeCard from '@/components/RecipeCard'
import { useOpenRecipe } from '@/components/recipeCanvas'

/**
 * A recipe suggestion inside an assistant message — the shared RecipeCard in its
 * compact "suggestion" variant, opening the real /recipes/:id detail on tap.
 * (Consolidation: this used to be a third hand-rolled card with its own gradient
 * palette + raw-minutes formatting; it now reuses the one card.)
 *
 * Opens through useOpenRecipe so the chat thread stays behind the canvas — a
 * plain navigate() would swap the pane to the library mid-conversation.
 */
export default function SuggestionCard({ recipe }: { recipe: RecipeResponse }) {
  const openRecipe = useOpenRecipe()
  return <RecipeCard recipe={recipe} variant="suggestion" onOpen={() => openRecipe(recipe.id)} />
}
