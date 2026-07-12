import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_ITEMS, activeTab } from './navItems'
import type { Mode } from './ThemeRoot'

interface Props {
  mode: Mode
  onToggleMode: () => void
  onCollapse: () => void
}

export default function Sidebar({ mode, onToggleMode, onCollapse }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const current = activeTab(pathname)

  return (
    <aside className="sidebar">
      {/* App title (moved here from the chat header) + collapse control */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0 8px', marginBottom: 26 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            What are we cooking?
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>AI recipe assistant</div>
        </div>
        <button
          onClick={onCollapse}
          title="Hide sidebar"
          aria-label="Hide sidebar"
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: 9,
            border: '1px solid var(--border)',
            background: 'var(--surface2)',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 15,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          «
        </button>
      </div>

      {/* New-recipe entry point (lane B, checkpoint 05 — sanctioned additive edit) */}
      <button
        onClick={() => navigate('/recipes/new')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          cursor: 'pointer',
          border: 'none',
          borderRadius: 13,
          padding: '11px 12px',
          marginBottom: 14,
          fontFamily: 'inherit',
          fontSize: 14.5,
          fontWeight: 700,
          textAlign: 'left',
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
        }}
      >
        <span style={{ fontSize: 18, width: 20, textAlign: 'center' }}>＋</span>
        New recipe
      </button>

      {/* Nav — drives the router; active state derives from the URL */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV_ITEMS.map((item) => {
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.to)}
              aria-current={active ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                cursor: 'pointer',
                border: 'none',
                borderRadius: 13,
                padding: '11px 12px',
                fontFamily: 'inherit',
                fontSize: 14.5,
                fontWeight: 600,
                textAlign: 'left',
                transition: 'background 0.2s, color 0.2s',
                background: active ? 'var(--chipbg)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              <span style={{ fontSize: 18, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      <button
        onClick={onToggleMode}
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          width: '100%',
          cursor: 'pointer',
          border: 'none',
          borderRadius: 13,
          padding: '11px 12px',
          fontFamily: 'inherit',
          fontSize: 14.5,
          fontWeight: 600,
          textAlign: 'left',
          background: 'transparent',
          color: 'var(--muted)',
        }}
      >
        <span style={{ fontSize: 18, width: 20, textAlign: 'center' }}>{mode === 'light' ? '☾' : '☀'}</span>
        {mode === 'light' ? 'Dark mode' : 'Light mode'}
      </button>
    </aside>
  )
}
