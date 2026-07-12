import { useNavigate } from 'react-router-dom'
import LibraryTab from '@/components/LibraryTab'
import type { RecipeId } from '@/data/recipes'

// Mock-era stand-in for the old RecipeApp saved map; checkpoint 04 replaces
// this whole page with the real GET /recipes browse and drops the saved concept.
const SAVED: Record<RecipeId, boolean> = {
  ramen: true,
  lentil: true,
  shakshuka: false,
}

export default function BrowsePage() {
  const navigate = useNavigate()
  const savedCount = Object.values(SAVED).filter(Boolean).length

  return (
    <LibraryTab
      onOpenRecipe={(id) => navigate(`/recipes/${id}`)}
      saved={SAVED}
      savedCount={savedCount}
    />
  )
}
