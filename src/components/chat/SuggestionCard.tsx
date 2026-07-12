import { useNavigate } from 'react-router-dom'
import type { RecipeResponse } from '@/api/types'
import { Badge } from '@/components/ui/badge'

/**
 * A recipe suggestion inside an assistant message — the same card idiom as the
 * rest of the app (surface + border + cardsh), navigating to the real
 * /recipes/:id detail route on tap.
 */
export default function SuggestionCard({ recipe }: { recipe: RecipeResponse }) {
  const navigate = useNavigate()

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={recipe.title}
      onClick={() => navigate(`/recipes/${recipe.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/recipes/${recipe.id}`)
        }
      }}
      style={{
        cursor: 'pointer',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 18,
        padding: 14,
        display: 'flex',
        gap: 13,
        alignItems: 'center',
        marginBottom: 11,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: 14,
          background: recipe.imageUrl ? `center / cover no-repeat url(${recipe.imageUrl})` : gradientFor(recipe.id),
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{recipe.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 7px' }}>{dietLine(recipe)}</div>
        {recipe.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recipe.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[11px] font-normal py-0.5 px-2.5"
                style={{ background: 'var(--tagbg)', borderColor: 'var(--tagborder)', color: 'var(--tagcol)' }}
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 18 }}>›</div>
    </div>
  )
}

/** A compact "30 min · 420 kcal · Easy · Japanese" summary line. */
function dietLine(recipe: RecipeResponse): string {
  const parts: string[] = []
  if (recipe.totalTimeMinutes) parts.push(`${recipe.totalTimeMinutes} min`)
  if (recipe.caloriesPerServing != null) parts.push(`${recipe.caloriesPerServing} kcal`)
  parts.push(recipe.difficulty)
  if (recipe.cuisineType) parts.push(recipe.cuisineType)
  return parts.join(' · ')
}

// A stable gradient derived from the id, so a recipe without an image still
// reads like the app's gradient thumbnails rather than a flat block.
const GRADIENTS = [
  'radial-gradient(circle at 50% 38%, #f0a35a, #c9512b 80%)',
  'radial-gradient(circle at 50% 38%, #e8b65a, #b06a2a 80%)',
  'radial-gradient(circle at 50% 38%, #ef7e63, #b3372a 80%)',
  'radial-gradient(circle at 50% 38%, #7fb069, #3f7a3f 80%)',
  'radial-gradient(circle at 50% 38%, #6ab7c9, #2b6d7f 80%)',
]

function gradientFor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}
