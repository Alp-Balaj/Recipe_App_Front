import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import RecipeDetail from '@/components/RecipeDetail'
import { RECIPES, type RecipeId } from '@/data/recipes'

// Same defaults the old RecipeApp saved map used; purely local until the
// real detail page (checkpoint 03) and saved-recipes (phase 5) land.
const DEFAULT_SAVED: Record<RecipeId, boolean> = {
  ramen: true,
  lentil: true,
  shakshuka: false,
}

function isRecipeId(id: string | undefined): id is RecipeId {
  return !!id && id in RECIPES
}

export default function RecipeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(() => (isRecipeId(id) ? DEFAULT_SAVED[id] : false))

  const close = () => {
    // Back to wherever we came from; deep links with no in-app history land on the library.
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/library', { replace: true })
  }

  if (!isRecipeId(id)) {
    return (
      <div
        className="scroll"
        style={{
          position: 'absolute',
          inset: 0,
          bottom: 'var(--nav-h, 74px)',
          overflowY: 'auto',
          padding: '54px 18px 16px',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Recipe not found</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 18px' }}>
          This recipe doesn't exist (or isn't cooked up yet).
        </div>
        <button
          onClick={() => navigate('/library', { replace: true })}
          style={{
            cursor: 'pointer',
            border: 'none',
            borderRadius: 13,
            padding: '11px 16px',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          Back to library
        </button>
      </div>
    )
  }

  return (
    <RecipeDetail
      recipe={RECIPES[id]}
      saved={saved}
      onClose={close}
      onToggleSave={() => setSaved((s) => !s)}
    />
  )
}
