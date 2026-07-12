import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import type { Mode } from './ThemeRoot'

interface Props {
  mode: Mode
  onSetMode: (mode: Mode) => void
}

export default function ProfileTab({ mode, onSetMode }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const username = user?.username ?? 'Signed in'
  const initial = username.charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

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

      {/* User card — real logged-in identity */}
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 22,
          fontWeight: 800,
        }}>
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {username}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Signed in</div>
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

      {/* Account section — logout */}
      <div style={{
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontWeight: 700,
        margin: '20px 0 10px',
      }}>
        Account
      </div>
      <button
        onClick={handleLogout}
        style={{
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          borderRadius: 16,
          padding: '14px 16px',
          fontSize: 14.5,
          fontWeight: 700,
          fontFamily: 'inherit',
          color: '#d9534f',
        }}
      >
        Log out
      </button>
    </div>
  )
}
