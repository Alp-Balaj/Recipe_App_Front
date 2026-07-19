import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import Avatar from '@/components/Avatar'
import { useUserProfile } from '@/hooks/useUserProfile'
import { cookingRankMeta } from '@/lib/cookingRank'
import { NAV_ITEMS, activeTab } from './navItems'
import type { Mode } from './ThemeRoot'

interface Props {
  mode: Mode
  onToggleMode: () => void
  onCollapse: () => void
}

/**
 * Desktop navigation rail — the imported redesign's sidebar (design 1f/2a):
 * a gradient logo tile, a gradient "New recipe" CTA, amber-tinted active nav
 * pills, and a footer with the cooking-rank card (real rank from GET
 * /users/{me}) plus the profile row (avatar → /profile) and theme toggle.
 */
export default function Sidebar({ mode, onToggleMode, onCollapse }: Props) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { data: profile } = useUserProfile(user?.userId)
  const current = activeTab(pathname)
  const username = user?.username ?? 'You'
  const rank = cookingRankMeta(profile?.cookingRank ?? 0)

  return (
    <aside className="sidebar">
      {/* Brand + collapse control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px', marginBottom: 24 }}>
        <div
          aria-hidden
          style={{
            width: 34,
            height: 34,
            borderRadius: 11,
            background: 'var(--accent-grad)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 17,
            flexShrink: 0,
          }}
        >
          🍳
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          What are
          <br />
          we cooking?
        </div>
        <button
          onClick={onCollapse}
          title="Hide sidebar"
          aria-label="Hide sidebar"
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            borderRadius: 9,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          «
        </button>
      </div>

      {/* New-recipe CTA — gradient pill (design). */}
      <button
        onClick={() => navigate('/recipes/new')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 9,
          width: '100%',
          cursor: 'pointer',
          border: 'none',
          borderRadius: 14,
          padding: 12,
          marginBottom: 18,
          fontFamily: 'inherit',
          fontSize: 14,
          fontWeight: 800,
          background: 'var(--accent-grad)',
          color: '#1a1207',
        }}
      >
        <span style={{ fontSize: 16 }}>＋</span>
        New recipe
      </button>

      {/* Nav — drives the router; active state derives from the URL. */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
                padding: '11px 13px',
                fontFamily: 'inherit',
                fontSize: 14.5,
                fontWeight: 600,
                textAlign: 'left',
                transition: 'background 0.2s, color 0.2s',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              <span style={{ fontSize: 17, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* Footer — cooking-rank card + profile row (with theme toggle). */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            padding: '13px 14px',
          }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
            Cooking rank
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 5 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>✦ {rank.value}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{rank.title}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface2)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${rank.progress}%`, height: '100%', background: 'var(--accent-grad)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 6px' }}>
          <button
            onClick={() => navigate('/profile')}
            aria-label="View profile"
            style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
          >
            <Avatar username={username} seed={user?.userId ?? username} size={34} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {username}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)' }}>View profile</span>
            </span>
          </button>
          <button
            onClick={onToggleMode}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer', fontFamily: 'inherit', padding: 4 }}
          >
            {mode === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </div>
    </aside>
  )
}
