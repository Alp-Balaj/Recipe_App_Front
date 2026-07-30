import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { requiresAuth, useAuthGate } from '@/auth/AuthGateContext'
import Avatar from '@/components/Avatar'
import NotificationBell from '@/components/NotificationBell'
import { useUserProfile } from '@/hooks/useUserProfile'
import { cookingRankMeta } from '@/lib/cookingRank'
import { MoonIcon, PlusIcon, SunIcon } from './navIcons'
import { DESKTOP_NAV_ITEMS, activeTab } from './navItems'
import { useBackdropPath } from './recipeCanvas'
import { BrandLogo, PanelIcon } from './SidebarRail'
import SidebarSections from './SidebarSections'
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
  const { user } = useAuth()
  const { isGuest, promptLogin, requireAuth } = useAuthGate()
  const { data: profile } = useUserProfile(user?.userId)
  // The open recipe is a canvas over a page, not a destination: the tab that
  // stays lit is the one for the page behind it.
  const backdropPath = useBackdropPath()
  const current = activeTab(backdropPath)
  // stream D (governor): /admin maps to no tab; the extra admin pill below
  // lights itself from the raw path instead.
  const onAdmin = backdropPath === '/admin'
  const username = user?.username ?? 'You'
  const rank = cookingRankMeta(profile?.cookingRank ?? 0)

  // Guest access (D5): every nav item stays visible; tapping an account-only
  // destination opens the login prompt instead of navigating.
  const go = (to: string) => {
    if (requiresAuth(to) && !requireAuth()) return
    navigate(to)
  }

  return (
    <aside className="sidebar">
      {/* Brand + collapse control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px', marginBottom: 24 }}>
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BrandLogo size={26} />
        </span>
        <div style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          Cooked!
        </div>
        <button
          onClick={onCollapse}
          title="Close sidebar"
          aria-label="Close sidebar"
          aria-expanded
          style={{
            flexShrink: 0,
            width: 30,
            height: 30,
            borderRadius: 9,
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PanelIcon />
        </button>
      </div>

      {/* New-recipe CTA — gradient pill (design). */}
      <button
        onClick={() => go('/recipes/new')}
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
          background: 'var(--olive)',
          color: 'var(--olive-ink)',
        }}
      >
        <PlusIcon size={17} />
        New recipe
      </button>

      {/* Nav + the Recipes/Chats sections scroll together; the footer stays pinned. */}
      <div className="scroll" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        {/* Nav — drives the router; active state derives from the URL. */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {DESKTOP_NAV_ITEMS.map((item) => {
            const active = current === item.id
            return (
              <button
                key={item.id}
                onClick={() => go(item.to)}
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
                  // Design 4a/4b: the active rail item is a solid olive pill.
                  fontWeight: active ? 800 : 600,
                  textAlign: 'left',
                  transition: 'background 0.2s, color 0.2s',
                  background: active ? 'var(--accent-fill)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--muted)',
                }}
              >
                <item.icon size={19} />
                {item.label}
              </button>
            )
          })}
          {/* stream D (governor): the admin queue — visible only to admins.
              Not a NAV_ITEMS entry (navItems.ts is frozen shell internals);
              a role-gated extra pill in the same visual vocabulary. */}
          {user?.role === 'Admin' && (
            <button
              onClick={() => go('/admin')}
              aria-current={onAdmin ? 'page' : undefined}
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
                fontWeight: onAdmin ? 800 : 600,
                textAlign: 'left',
                transition: 'background 0.2s, color 0.2s',
                background: onAdmin ? 'var(--accent-fill)' : 'transparent',
                color: onAdmin ? 'var(--accent-ink)' : 'var(--muted)',
              }}
            >
              <span style={{ width: 19, textAlign: 'center', fontWeight: 800 }}>⚖</span>
              Admin
            </button>
          )}
        </nav>

        {/* Collapsible Recipes / Chats lists (ChatGPT pattern). */}
        <SidebarSections />
      </div>

      {/* Footer — guest: the persistent sign-in CTA (guest access, D8);
          signed in: cooking-rank card + profile row (with theme toggle). */}
      {isGuest ? (
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
          <button
            onClick={promptLogin}
            style={{
              width: '100%',
              cursor: 'pointer',
              border: 'none',
              borderRadius: 14,
              padding: 12,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 800,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            Log in / Sign up
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Browsing as guest</span>
            <button
              onClick={onToggleMode}
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ flexShrink: 0, display: 'flex', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', padding: 4 }}
            >
              {mode === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>
          </div>
        </div>
      ) : (
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
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
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>pts · {rank.title}</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface2)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${rank.progress}%`, height: '100%', background: 'var(--accent-grad)' }} />
          </div>
          <div style={{ marginTop: 7, fontSize: 10.5, color: 'var(--muted)' }}>
            {rank.pointsToNext != null ? `${rank.pointsToNext} pts to ${rank.nextTitle}` : 'Top tier'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 6px' }}>
          <button
            onClick={() => go('/profile')}
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
          {/* open-loops slice 3: the bell sits with the avatar and the theme
              toggle because it is chrome, not navigation — navItems.ts stays a
              six-tab list. Signed-in branch only: notifications are
              account-only, so a guest has nothing to poll. */}
          <NotificationBell size={18} />
          <button
            onClick={onToggleMode}
            title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ flexShrink: 0, display: 'flex', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit', padding: 4 }}
          >
            {mode === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
        </div>
      </div>
      )}
    </aside>
  )
}
