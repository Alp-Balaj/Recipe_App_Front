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

// KAN-19 — the recovery screens (verify-email, forgot-password, reset-password) needed the
// same four scraps of styling as each other, and three copies of an accent link is three
// places for the accent to drift. They live here, beside SubmitButton, because this file is
// already the shared chrome for exactly these pages.

/** Muted body copy inside an auth card. */
export const authMuted = {
  fontSize: 13.5,
  color: 'var(--muted)',
  lineHeight: 1.55,
} as const

/** An inline accent link — the footer idiom, reusable in the body. */
export const authLink = {
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
} as const

/** SubmitButton's look, for a real <button> that does not submit a form. */
export const authButton = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 13,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontSize: 14.5,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
} as const

/** The same look for a react-router <Link> that acts as the primary action. */
export const authLinkButton = {
  ...authButton,
  display: 'block',
  boxSizing: 'border-box',
  textAlign: 'center',
  textDecoration: 'none',
} as const

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
