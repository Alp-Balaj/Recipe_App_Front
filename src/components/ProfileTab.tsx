import type { Mode } from './RecipeApp'

interface Props {
  mode: Mode
  onSetMode: (mode: Mode) => void
}

export default function ProfileTab({ mode, onSetMode }: Props) {
  const isLight = mode === 'light'

  return (
    <div
      className="scroll"
      style={{
        position: 'absolute',
        inset: 0,
        bottom: 'var(--nav-h, 74px)',
        overflowY: 'auto',
        padding: '54px 18px 16px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 18 }}>Profile</div>

      {/* User card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 35%, #5fb87e, #2f7349)',
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Alex Rivera</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Vegetarian · ~30 min meals</div>
        </div>
      </div>

      {/* Appearance section label */}
      <div style={{
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontWeight: 700,
        margin: '6px 0 10px',
      }}>
        Appearance
      </div>

      {/* Theme toggle */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        padding: 6,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['light', 'dark'] as Mode[]).map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => onSetMode(m)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: 12,
                  borderRadius: 15,
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s, color 0.2s',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--muted)',
                }}
              >
                {m === 'light' ? '☀ Light' : '☾ Dark'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stats card */}
      <div style={{
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontWeight: 700,
        margin: '20px 0 10px',
      }}>
        Your stats
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
      }}>
        {[
          { value: '47', label: 'Recipes cooked' },
          { value: '2', label: 'Saved recipes' },
          { value: '12', label: 'Weeks active' },
          { value: isLight ? 'Light' : 'Dark', label: 'Current theme' },
        ].map(({ value, label }) => (
          <div key={label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--cardsh)',
            borderRadius: 16,
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
