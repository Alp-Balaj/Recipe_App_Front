import { useNavigate } from 'react-router-dom'
import type { RecipeResponse } from '@/api/types'
import RecipeCard from '@/components/RecipeCard'

/**
 * A recipe suggestion inside an assistant message — the shared RecipeCard in its
 * compact "suggestion" variant, navigating to the real /recipes/:id detail route
 * on tap. (Consolidation: this used to be a third hand-rolled card with its own
 * gradient palette + raw-minutes formatting; it now reuses the one card.)
 */
export default function SuggestionCard({ recipe }: { recipe: RecipeResponse }) {
  const navigate = useNavigate()
  return <RecipeCard recipe={recipe} variant="suggestion" onOpen={() => navigate(`/recipes/${recipe.id}`)} />
}
