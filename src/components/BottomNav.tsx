import { useNavigate } from 'react-router-dom'
import { PlusIcon } from './navIcons'
import { NAV_ITEMS, activeTab } from './navItems'
import { useBackdropPath } from './recipeCanvas'

export default function BottomNav() {
  const navigate = useNavigate()
  // An open recipe overlays the page it was opened from — keep that tab lit.
  const current = activeTab(useBackdropPath())

  return (
    <>
      {/* New-recipe FAB (lane B, checkpoint 05 — sanctioned additive edit).
          Floats just above the tab bar; navigates to the create form. */}
      <button
        onClick={() => navigate('/recipes/new')}
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
            onClick={() => navigate(item.to)}
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
