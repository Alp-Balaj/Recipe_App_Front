// ─────────────────────────────────────────────────────────────────────────
// The one loading / error / empty placeholder, shared across every list
// surface (fe · consolidation).
//
// Before: four divergent locals — BrowsePage's StateBlock (the cleanest API),
// MyRecipesPage's StateNote (a card shell taking children), RecipeDetailPage's
// DetailMessage (same API but full-page), and ChatPage's inline "Loading…".
//
// Now: one component with {title, body?, action?}. `variant="inline"` (default)
// renders a centered block inside the page body; `variant="page"` renders a
// full-page placeholder (the detail route's early-return states).
// ─────────────────────────────────────────────────────────────────────────

const PAGE_STYLE = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 16px',
} as const

export interface StateBlockProps {
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  variant?: 'inline' | 'page'
}

export default function StateBlock({ title, body, action, variant = 'inline' }: StateBlockProps) {
  if (variant === 'page') {
    return (
      <div className="scroll" style={PAGE_STYLE}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</div>
        {body && (
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 18px' }}>{body}</div>
        )}
        {action && (
          <button onClick={action.onClick} style={pageActionBtn}>
            {action.label}
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '40px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
      {body && (
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px auto 16px', maxWidth: 320 }}>
          {body}
        </div>
      )}
      {action && (
        <button onClick={action.onClick} style={{ ...inlineActionBtn, marginTop: body ? 0 : 16 }}>
          {action.label}
        </button>
      )}
    </div>
  )
}

const inlineActionBtn = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
} as const

const pageActionBtn = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 13,
  padding: '11px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
} as const
