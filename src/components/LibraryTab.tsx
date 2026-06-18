import { RECIPES, type RecipeId } from '@/data/recipes'
import { Badge } from './ui/badge'

interface Props {
  onOpenRecipe: (id: RecipeId) => void
  saved: Record<RecipeId, boolean>
  savedCount: number
}

const FILTERS = ['All', 'Vegetarian', 'Quick (<30m)', 'High protein']

export default function LibraryTab({ onOpenRecipe, saved, savedCount }: Props) {
  const savedRecipes = (Object.keys(RECIPES) as RecipeId[]).filter((id) => saved[id])

  return (
    <div
      className="scroll"
      style={{
        position: 'absolute',
        inset: 0,
        bottom: 74,
        overflowY: 'auto',
        padding: '54px 18px 16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Your library</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{savedCount} saved recipes</div>
        </div>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--surface2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          color: 'var(--text)',
        }}>
          ⌕
        </div>
      </div>

      {/* Filter chips */}
      <div
        className="scroll"
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          margin: '0 -18px 18px',
          padding: '0 18px 2px',
        }}
      >
        {FILTERS.map((filter, i) => (
          <span
            key={filter}
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              padding: '7px 15px',
              borderRadius: 999,
              background: i === 0 ? 'var(--accent)' : 'var(--surface2)',
              color: i === 0 ? 'var(--accent-ink)' : 'var(--muted)',
              cursor: 'pointer',
            }}
          >
            {filter}
          </span>
        ))}
      </div>

      {/* Library cards */}
      {savedRecipes.map((id) => {
        const r = RECIPES[id]
        return (
          <div
            key={id}
            onClick={() => onOpenRecipe(id)}
            style={{
              cursor: 'pointer',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--cardsh)',
              borderRadius: 22,
              overflow: 'hidden',
              marginBottom: 16,
            }}
          >
            {/* Gradient banner */}
            <div style={{ height: 104, background: r.gradient }} />

            <div style={{ padding: '15px 16px' }}>
              {/* Name + saved badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{r.name}</div>
                <Badge
                  variant="outline"
                  className="text-[11px] font-bold shrink-0"
                  style={{
                    background: 'var(--chipbg)',
                    borderColor: 'transparent',
                    color: 'var(--chipcol)',
                  }}
                >
                  saved
                </Badge>
              </div>

              {/* Blurb */}
              <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.45, margin: '4px 0 12px' }}>
                {r.blurb}
              </div>

              {/* Stats */}
              <div style={{
                display: 'flex',
                gap: 14,
                fontSize: 12.5,
                color: 'var(--muted)',
                paddingBottom: 12,
                borderBottom: '1px solid var(--hair)',
                marginBottom: 12,
              }}>
                <span>◷ {r.time}</span>
                <span>♨ {r.kcal} kcal</span>
                <span>▤ {r.ingCount}</span>
              </div>

              {/* Macro tags + View link */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 7 }}>
                  {r.macroTags.map((m) => (
                    <Badge
                      key={m}
                      variant="outline"
                      className="text-[11.5px] font-normal"
                      style={{
                        background: 'var(--tagbg)',
                        borderColor: 'var(--tagborder)',
                        color: 'var(--tagcol)',
                      }}
                    >
                      {m}
                    </Badge>
                  ))}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>View ›</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
