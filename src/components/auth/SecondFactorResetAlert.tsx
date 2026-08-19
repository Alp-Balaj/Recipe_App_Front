// ─────────────────────────────────────────────────────────────────────────
// The pending-reset strip (KAN-21).
//
// WHY IT IS GLOBAL. Somebody has started the 48-hour countdown to have this
// account's second factor removed by email. The only person who can stop it is
// whoever is still signed in — stopping it requires a session, which requires
// the factor — and they are, by definition, not sitting in Settings when it
// starts. The whole point of a two-day delay is that the account holder SEES it,
// so the warning has to find them wherever they are.
//
// It reads `user.secondFactorResetEffectiveAtUtc`, which rides on the identity
// response every boot already makes and which /auth/refresh answers with too, so
// a tab that was open when the countdown started learns about it within one
// access-token lifetime — no poll, no socket.
//
// DELIBERATELY NOT DISMISSIBLE. A dismiss button on this is a way to lose an
// account by reflex. It goes away when the reset is cancelled or lands, and not
// before.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

export default function SecondFactorResetAlert() {
  const { user } = useAuth()
  const effectiveAt = user?.secondFactorResetEffectiveAtUtc
  if (!effectiveAt) return null

  return (
    <div role="alert" style={strip}>
      <span>
        Someone asked to turn off two-step sign-in for your account, effective{' '}
        <strong>{formatDeadline(effectiveAt)}</strong>.
      </span>{' '}
      <Link to="/profile" style={link}>
        Review it in Settings → Security
      </Link>
    </div>
  )
}

/** In the reader's own time zone: the question is "is there still time", and a wall clock answers it. */
function formatDeadline(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime())
    ? 'soon'
    : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

// Fixed rather than in the document flow, so it can be mounted from the shell
// without shifting any of the absolutely-positioned tab pages underneath it.
const strip: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: 60,
  padding: '9px 14px',
  textAlign: 'center',
  fontSize: 12.5,
  lineHeight: 1.5,
  color: '#ffffff',
  background: '#b8443f',
  boxShadow: '0 2px 10px rgba(0, 0, 0, 0.18)',
}

const link: CSSProperties = {
  color: '#ffffff',
  fontWeight: 800,
  textDecoration: 'underline',
  whiteSpace: 'nowrap',
}
