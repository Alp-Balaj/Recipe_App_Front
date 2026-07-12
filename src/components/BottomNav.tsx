import { useLocation, useNavigate } from 'react-router-dom'
import { NAV_ITEMS, activeTab } from './navItems'

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const current = activeTab(pathname)

  return (
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
              color: active ? 'var(--accent)' : 'var(--muted)',
              fontFamily: 'inherit',
              transition: 'color 0.2s',
              padding: 0,
            }}
          >
            <div style={{ fontSize: 19 }}>{item.icon}</div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
          </button>
        )
      })}
    </div>
  )
}
