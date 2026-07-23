import { useNavigate } from 'react-router-dom'
import { requiresAuth, useAuthGate } from '@/auth/AuthGateContext'
import { PlusIcon } from './navIcons'
import { NAV_ITEMS, activeTab } from './navItems'
import { useBackdropPath } from './recipeCanvas'

export default function BottomNav() {
  const navigate = useNavigate()
  const { isGuest, promptLogin, requireAuth } = useAuthGate()
  // An open recipe overlays the page it was opened from — keep that tab lit.
  const current = activeTab(useBackdropPath())

  // Guest access (D5): the tab bar keeps every tab; tapping an account-only
  // destination opens the login prompt instead of navigating.
  const go = (to: string) => {
    if (requiresAuth(to) && !requireAuth()) return
    navigate(to)
  }

  return (
    <>
      {/* Guest access (D8): guests get the persistent sign-in CTA in the FAB
          slot; signed in keeps the New-recipe FAB (lane B cp05 addition). */}
      {isGuest ? (
        <button
          onClick={promptLogin}
          aria-label="Log in / Sign up"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 74 + 14,
            height: 44,
            padding: '0 18px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
            fontSize: 13.5,
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: 'var(--cardsh)',
            zIndex: 5,
          }}
        >
          Log in / Sign up
        </button>
      ) : (
        <button
          onClick={() => go('/recipes/new')}
          aria-label="New recipe"
          style={{
            position: 'absolute',
            right: 16,
            bottom: 74 + 14,
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--olive)',
            color: 'var(--olive-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'inherit',
            cursor: 'pointer',
            boxShadow: 'var(--cardsh)',
            zIndex: 5,
          }}
        >
          <PlusIcon size={24} />
        </button>
      )}

      <div
        className="bottom-nav"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 74,
          background: 'var(--navbg)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 6,
        }}
      >
      {NAV_ITEMS.map((item) => {
        const active = current === item.id
        return (
          <button
            key={item.id}
            onClick={() => go(item.to)}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              color: active ? 'var(--accent)' : 'var(--navidle)',
              fontFamily: 'inherit',
              transition: 'color 0.2s',
              padding: 0,
            }}
          >
            <item.icon size={22} />
            <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
          </button>
        )
      })}
      </div>
    </>
  )
}
