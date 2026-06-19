import { RECIPES, type RecipeId } from '@/data/recipes'
import { Badge } from './ui/badge'
import type { Mode } from './RecipeApp'

interface Props {
  onOpenRecipe: (id: RecipeId) => void
  mode: Mode
  onToggleMode: () => void
}

export default function ChatTab({ onOpenRecipe, mode, onToggleMode }: Props) {
  return (
    <>
      <div
        className="scroll"
        style={{
          position: 'absolute',
          inset: 0,
          bottom: 'var(--nav-h, 74px)',
          overflowY: 'auto',
          padding: '54px 18px 80px',
        }}
      >
        {/* Header */}
        <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>What are we cooking?</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>AI recipe assistant</div>
          </div>
          {/* Theme toggle — lives in the header, which is hidden on desktop (>=1024px) via CSS */}
          <button
            className="chat-theme-toggle"
            onClick={onToggleMode}
            style={{
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--surface2)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: 'var(--text)',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {mode === 'dark' ? '☀' : '☾'}
          </button>
        </div>

        {/* AI greeting */}
        <div style={{
          background: 'var(--surface2)',
          borderRadius: '6px 18px 18px 18px',
          padding: '14px 16px',
          fontSize: 15,
          lineHeight: 1.5,
          marginBottom: 14,
          maxWidth: '88%',
        }}>
          Hey! Tell me what you're craving, how much time you have, or any dietary preferences — I'll find something great.
        </div>

        {/* User message */}
        <div style={{
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          borderRadius: '18px 6px 18px 18px',
          padding: '14px 16px',
          fontSize: 15,
          lineHeight: 1.5,
          margin: '0 0 16px auto',
          maxWidth: '82%',
          fontWeight: 500,
        }}>
          Something warm and filling, not too heavy. I have about 30 mins. No meat.
        </div>

        {/* AI response */}
        <div style={{
          background: 'var(--surface2)',
          borderRadius: '6px 18px 18px 18px',
          padding: '14px 16px',
          fontSize: 15,
          lineHeight: 1.5,
          marginBottom: 14,
          maxWidth: '88%',
        }}>
          Got it — here are three options that fit well:
        </div>

        {/* Recipe suggestion cards */}
        {(['ramen', 'lentil', 'shakshuka'] as RecipeId[]).map((id) => {
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
                borderRadius: 18,
                padding: 14,
                display: 'flex',
                gap: 13,
                alignItems: 'center',
                marginBottom: 11,
              }}
            >
              <div style={{
                flexShrink: 0,
                width: 48,
                height: 48,
                borderRadius: 14,
                background: r.gradient,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{r.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 7px' }}>{r.dietLine}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {r.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[11px] font-normal py-0.5 px-2.5"
                      style={{
                        background: 'var(--tagbg)',
                        borderColor: 'var(--tagborder)',
                        color: 'var(--tagcol)',
                      }}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 18 }}>›</div>
            </div>
          )
        })}

        {/* Closing hint */}
        <div style={{
          background: 'var(--surface2)',
          borderRadius: 18,
          padding: '13px 15px',
          fontSize: 14,
          lineHeight: 1.5,
          color: 'var(--muted)',
          maxWidth: '90%',
        }}>
          Tap any card for more detail, or tell me to adjust — less spicy, fewer ingredients, etc.
        </div>
      </div>

      {/* Chat input bar */}
      <div style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 'var(--nav-h, 74px)',
        padding: '10px 18px 12px',
        background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
        display: 'flex',
        gap: 9,
        alignItems: 'center',
      }}>
        <div style={{
          flex: 1,
          background: 'var(--inputbg)',
          border: '1px solid var(--border)',
          borderRadius: 999,
          padding: '12px 16px',
          fontSize: 13.5,
          color: 'var(--muted)',
        }}>
          Refine or ask something else…
        </div>
        <button
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-ink)',
            fontSize: 18,
            cursor: 'pointer',
          }}
        >
          ↑
        </button>
      </div>
    </>
  )
}
