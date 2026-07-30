import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import appIcon from '@/assets/app-icon.png'
import { useAuth } from '@/auth/AuthContext'
import { requiresAuth, useAuthGate } from '@/auth/AuthGateContext'
import Avatar from '@/components/Avatar'
import NotificationBell from '@/components/NotificationBell'
import { MoonIcon, PlusIcon, ProfileIcon, SunIcon } from './navIcons'
import { DESKTOP_NAV_ITEMS, activeTab } from './navItems'
import { useBackdropPath } from './recipeCanvas'
import type { Mode } from './ThemeRoot'

interface Props {
  mode: Mode
  onToggleMode: () => void
  onExpand: () => void
}

/** ChatGPT-style "panel" glyph — the collapse / expand affordance. */
export function PanelIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4.5" y="5.5" width="4" height="13" rx="1.6" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

/**
 * One size for everything in the rail: a 40×40 hit target wrapping a 32×32
 * visual tile that carries the state colour. Brand, "+", nav tabs, theme
 * toggle and avatar all use it, so the column reads as a single stack of
 * equally sized icons.
 */
const HIT = 40
const TILE = 32
const ICON = 20

const railButtonStyle: CSSProperties = {
  width: HIT,
  height: HIT,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  borderRadius: 12,
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--muted)',
}

function tileStyle(active: boolean): CSSProperties {
  return {
    width: TILE,
    height: TILE,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s, color 0.15s',
    // Left unset when idle so the CSS hover rule can fill it (inline styles
    // would otherwise always win over the stylesheet).
    ...(active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : null),
  }
}

/**
 * Collapsed desktop rail (ChatGPT pattern): the brand tile doubles as the
 * re-open control — hovering it swaps the logo for the panel glyph — and only
 * the primary actions (new recipe + the nav tabs) keep their icons. The
 * expanded sidebar lives in Sidebar.tsx.
 */
export default function SidebarRail({ mode, onToggleMode, onExpand }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isGuest, promptLogin, requireAuth } = useAuthGate()
  const [brandHover, setBrandHover] = useState(false)
  // Same as Sidebar: an open recipe canvas keeps the underlying page's tab lit.
  const current = activeTab(useBackdropPath())
  const username = user?.username ?? 'You'

  // Guest access (D5): identical rail; account-only destinations gate on tap.
  const go = (to: string) => {
    if (requiresAuth(to) && !requireAuth()) return
    navigate(to)
  }

  return (
    <aside className="sidebar-rail">
      {/* Brand tile → panel glyph on hover/focus; click re-opens the sidebar. */}
      <button
        onClick={onExpand}
        onMouseEnter={() => setBrandHover(true)}
        onMouseLeave={() => setBrandHover(false)}
        onFocus={() => setBrandHover(true)}
        onBlur={() => setBrandHover(false)}
        title="Open sidebar"
        aria-label="Open sidebar"
        aria-expanded={false}
        style={{
          ...railButtonStyle,
          color: brandHover ? 'var(--accent)' : 'var(--text)',
        }}
      >
        <span
          aria-hidden
          style={{
            ...tileStyle(false),
            background: brandHover ? 'var(--accent-soft)' : '',
          }}
        >
          {brandHover ? <PanelIcon size={ICON} /> : <BrandLogo />}
        </span>
      </button>

      {/* Primary actions — new recipe, then the nav tabs. */}
      <button
        onClick={() => go('/recipes/new')}
        title="New recipe"
        aria-label="New recipe"
        style={railButtonStyle}
      >
        <span aria-hidden style={{ ...tileStyle(false), background: 'var(--olive)', color: 'var(--olive-ink)' }}>
          <PlusIcon size={ICON} />
        </span>
      </button>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {DESKTOP_NAV_ITEMS.map((item) => {
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => go(item.to)}
              className="rail-btn"
              title={item.label}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={railButtonStyle}
            >
              <span className="rail-tile" style={tileStyle(active)}>
                <item.icon size={ICON} />
              </span>
            </button>
          )
        })}
      </nav>

      {/* Footer — bell (signed in), theme toggle, profile avatar. */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {/* open-loops slice 3. The rail's own tile geometry rather than the
            bell's default padding, so it lines up with the buttons above it. */}
        {!isGuest && <NotificationBell size={ICON} style={{ width: TILE, height: TILE }} />}
        <button
          onClick={onToggleMode}
          className="rail-btn"
          title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={railButtonStyle}
        >
          <span className="rail-tile" style={tileStyle(false)}>
            {mode === 'dark' ? <SunIcon size={ICON} /> : <MoonIcon size={ICON} />}
          </span>
        </button>
        {isGuest ? (
          // Guest access (D8): the avatar slot becomes the sign-in CTA.
          <button
            onClick={promptLogin}
            className="rail-btn"
            title="Log in / Sign up"
            aria-label="Log in / Sign up"
            style={railButtonStyle}
          >
            <span className="rail-tile" style={{ ...tileStyle(false), background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              <ProfileIcon size={ICON} />
            </span>
          </button>
        ) : (
          <button
            onClick={() => go('/profile')}
            className="rail-btn"
            title="View profile"
            aria-label="View profile"
            style={railButtonStyle}
          >
            <span className="rail-tile" style={tileStyle(false)}>
              <Avatar username={username} seed={user?.userId ?? username} size={TILE - 4} />
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}

/**
 * The app mark (assets/app-icon.png): the orange salad-bowl glyph, keyed to
 * transparency and cropped square, so it sits directly on any surface in both
 * themes. Slightly larger than the 20px nav icons so it reads as the brand.
 */
export function BrandLogo({ size = 24 }: { size?: number }) {
  return (
    <img
      src={appIcon}
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}
