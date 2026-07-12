import { Link } from 'react-router-dom'

// Thin stub — checkpoint 02 replaces this with the real registration form.
export default function RegisterPage() {
  return (
    <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          borderRadius: 22,
          padding: '26px 22px',
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Create account</div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 16px' }}>
          Registration is coming in the next checkpoint.
        </div>
        <Link to="/library" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
          Browse the library ›
        </Link>
      </div>
    </div>
  )
}
