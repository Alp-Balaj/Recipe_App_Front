import type { Recipe } from '@/data/recipes'
import { Button } from './ui/button'

interface Props {
  recipe: Recipe
  saved: boolean
  onClose: () => void
  onToggleSave: () => void
}

export default function RecipeDetail({ recipe, saved, onClose, onToggleSave }: Props) {
  const shown = recipe.ingredients.slice(0, 5)
  const moreCount = recipe.ingredients.length - shown.length

  return (
    <div
      className="animate-detailIn"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 10,
        animation: 'detailIn 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)',
      }}
    >
      {/* Scrollable area */}
      <div
        className="scroll"
        style={{ position: 'absolute', inset: 0, bottom: 92, overflowY: 'auto' }}
      >
        {/* Gradient header */}
        <div style={{ position: 'relative', height: 210, background: recipe.gradient }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 54,
              left: 18,
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.32)',
              backdropFilter: 'blur(6px)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ←
          </button>
          <button
            onClick={onToggleSave}
            style={{
              position: 'absolute',
              top: 54,
              right: 18,
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(0,0,0,.32)',
              backdropFilter: 'blur(6px)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 17,
              cursor: 'pointer',
            }}
          >
            {saved ? '♥' : '♡'}
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>{recipe.name}</div>
          <div style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 8 }}>{recipe.blurb}</div>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            {[
              { icon: '◷', val: recipe.time },
              { icon: '▤', val: recipe.ingCount },
              { icon: '⊙', val: recipe.servings },
            ].map(({ icon, val }) => (
              <div
                key={val}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 13,
                  padding: '9px 6px',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {icon} {val}
              </div>
            ))}
          </div>

          {/* Nutrition grid */}
          <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
            {[
              { val: recipe.kcal, label: 'kcal' },
              { val: recipe.protein, label: 'protein' },
              { val: recipe.carbs, label: 'carbs' },
              { val: recipe.fat, label: 'fat' },
            ].map(({ val, label }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  background: 'var(--surface2)',
                  borderRadius: 14,
                  padding: '12px 4px',
                }}
              >
                <div style={{ fontSize: 19, fontWeight: 800 }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Ingredients */}
          <div style={{
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            fontWeight: 700,
            margin: '22px 0 4px',
          }}>
            Ingredients
          </div>

          {shown.map((ing, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: '9px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{
                flexShrink: 0,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--accent)',
                display: 'inline-block',
              }} />
              <span style={{ flexShrink: 0, width: 64, fontSize: 13.5, color: 'var(--muted)' }}>{ing.amt}</span>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{ing.name}</span>
            </div>
          ))}

          {moreCount > 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 11 }}>
              + {moreCount} more ingredients →
            </div>
          )}
        </div>
      </div>

      {/* Start cooking CTA */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '14px 18px 22px',
        background: 'linear-gradient(to top, var(--bg) 72%, transparent)',
      }}>
        <Button
          className="w-full rounded-2xl text-base font-bold py-4 h-auto active:scale-[0.99] transition-transform"
          style={{
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          ▷ Start cooking
        </Button>
      </div>
    </div>
  )
}
