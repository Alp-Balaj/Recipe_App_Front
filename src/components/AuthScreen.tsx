import type { ReactNode } from 'react'

interface AuthScreenProps {
  title: string
  subtitle: string
  /** Banner shown above the form (server error, e.g. bad credentials / taken). */
  banner?: string | null
  children: ReactNode
  footer: ReactNode
}

/**
 * Centered card chrome shared by the login and register pages. These render
 * OUTSIDE the tabbed AppShell (directly under ThemeRoot), so they own their
 * own full-height centering.
 */
export default function AuthScreen({ title, subtitle, banner, children, footer }: AuthScreenProps) {
  return (
    <div
      style={{
        flex: '1 1 auto',
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
    >
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
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 18px' }}>
          {subtitle}
        </div>

        {banner && (
          <div
            role="alert"
            style={{
              fontSize: 13,
              color: '#d9534f',
              background: 'rgba(217, 83, 79, 0.10)',
              border: '1px solid rgba(217, 83, 79, 0.35)',
              borderRadius: 12,
              padding: '10px 12px',
              marginBottom: 16,
            }}
          >
            {banner}
          </div>
        )}

        {children}

        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 18, textAlign: 'center' }}>
          {footer}
        </div>
      </div>
    </div>
  )
}

/** Full-width accent submit button in the app idiom. */
export function SubmitButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: '100%',
        padding: '12px 14px',
        marginTop: 4,
        borderRadius: 13,
        border: 'none',
        background: 'var(--accent)',
        color: 'var(--accent-ink)',
        fontSize: 14.5,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {children}
    </button>
  )
}
