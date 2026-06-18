import type { Tab } from './RecipeApp'

interface Props {
  tab: Tab
  onGoTo: (tab: Tab) => void
}

const NAV_ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: 'chat', icon: '◌', label: 'Chat' },
  { id: 'library', icon: '▤', label: 'Library' },
  { id: 'profile', icon: '◍', label: 'Profile' },
]

export default function BottomNav({ tab, onGoTo }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 74,
        background: 'var(--navbg)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        paddingBottom: 6,
      }}
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => onGoTo(item.id)}
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
            color: tab === item.id ? 'var(--accent)' : 'var(--muted)',
            fontFamily: 'inherit',
            transition: 'color 0.2s',
            padding: 0,
          }}
        >
          <div style={{ fontSize: 19 }}>{item.icon}</div>
          <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
        </button>
      ))}
    </div>
  )
}
