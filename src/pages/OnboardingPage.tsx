// ─────────────────────────────────────────────────────────────────────────
// /welcome — the skippable post-register wizard (stream K).
//
// Two steps over the vocabularies stream G already typed: the cuisines the
// user likes, then anything they avoid. Both are optional, and skipping is a
// real answer rather than a deferral — the server records it, so nobody is
// asked twice.
//
// It renders OUTSIDE the tabbed AppShell (directly under ThemeRoot, beside
// /login and /register), which is why it owns its own centering: a wizard with
// a bottom nav under it invites the user to leave through a tab bar without
// ever answering, and AppShell is frozen shell chrome anyway. The cost of
// sitting outside AppShell is that its global auth guard does not apply here,
// so this page guards itself — see the redirect below.
//
// The two steps are deliberately asymmetric in weight. Cuisines are a soft
// lean the app uses to break ties; restrictions are absolute rules it must
// never break. The copy says so, because a user who reads "preferences" and
// enters a serious allergy in the wrong step is a real failure mode.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { Cuisine, DietaryRestriction } from '@/api/types'
import { CUISINES, DIETARY_RESTRICTIONS, label } from '@/api/vocabulary'
import { useAuth } from '@/auth/AuthContext'
import { useCompleteOnboarding } from '@/hooks/useOnboarding'

type Step = 'cuisines' | 'restrictions'

export default function OnboardingPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const complete = useCompleteOnboarding()

  const [step, setStep] = useState<Step>('cuisines')
  const [cuisines, setCuisines] = useState<Cuisine[]>([])
  const [restrictions, setRestrictions] = useState<DietaryRestriction[]>([])
  const [banner, setBanner] = useState<string | null>(null)

  // Where the user was heading before registration interrupted them, matching
  // the destination RegisterPage would have used.
  const destination =
    (location.state as { from?: string } | null)?.from ?? '/discover'

  // Self-guard: AppShell's global route protection does not reach this page.
  // 'loading' falls through to the wizard rather than redirecting — a persisted
  // session is still being validated, and bouncing to /login mid-check would
  // sign out a user who is in fact authenticated.
  if (status === 'unauthenticated') return <Navigate to="/login" replace />

  const finish = async () => {
    setBanner(null)
    try {
      await complete.mutateAsync({
        cuisinePreferences: cuisines,
        dietaryRestrictions: restrictions,
      })
      navigate(destination, { replace: true })
    } catch {
      // The user made choices; losing them to a silent failure would be worse
      // than asking again, so this one stops and offers a retry.
      setBanner('Could not save your preferences. Check your connection and try again.')
    }
  }

  const skip = async () => {
    // Skipping still POSTs — an empty answer is what stamps the account as
    // onboarded. But it never blocks: someone who asked to leave should not be
    // held in a wizard by a network blip. A failed skip simply means the wizard
    // is offered once more on the next boot, which is the harmless direction to
    // fail in.
    try {
      await complete.mutateAsync({ cuisinePreferences: [], dietaryRestrictions: [] })
    } catch {
      // Deliberately ignored — see above.
    }
    navigate(destination, { replace: true })
  }

  const busy = complete.isPending
  const onCuisines = step === 'cuisines'

  return (
    <div style={page}>
      <div style={card}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)' }}>
          STEP {onCuisines ? '1' : '2'} OF 2
        </div>
        <h1 style={heading}>{onCuisines ? 'What do you like to cook?' : 'Anything you avoid?'}</h1>
        <p style={subtitle}>
          {onCuisines
            ? 'Pick any cuisines you lean toward. We use them to break ties when suggesting and planning — never to hide anything from you.'
            : 'These are treated as hard rules: the assistant will never suggest or generate a recipe that breaks one.'}
        </p>

        {banner && (
          <div role="alert" style={bannerStyle}>
            {banner}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 18 }}>
          {onCuisines
            ? CUISINES.map((cuisine) => (
                <Chip
                  key={cuisine}
                  text={label(cuisine)}
                  active={cuisines.includes(cuisine)}
                  onClick={() =>
                    setCuisines((prev) =>
                      prev.includes(cuisine)
                        ? prev.filter((c) => c !== cuisine)
                        : // Rebuilt in vocabulary order, so what is saved never
                          // reads in click order (same rule as Edit profile).
                          CUISINES.filter((c) => c === cuisine || prev.includes(c)),
                    )
                  }
                />
              ))
            : DIETARY_RESTRICTIONS.map((restriction) => (
                <Chip
                  key={restriction}
                  text={label(restriction)}
                  active={restrictions.includes(restriction)}
                  onClick={() =>
                    setRestrictions((prev) =>
                      prev.includes(restriction)
                        ? prev.filter((r) => r !== restriction)
                        : DIETARY_RESTRICTIONS.filter((r) => r === restriction || prev.includes(r)),
                    )
                  }
                />
              ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26 }}>
          <button type="button" onClick={() => void skip()} disabled={busy} style={skipButton}>
            Skip for now
          </button>
          <div style={{ flex: 1 }} />
          {!onCuisines && (
            <button type="button" onClick={() => setStep('cuisines')} disabled={busy} style={backButton}>
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (onCuisines ? setStep('restrictions') : void finish())}
            disabled={busy}
            style={primaryButton(busy)}
          >
            {onCuisines ? 'Next' : busy ? 'Saving…' : 'Finish'}
          </button>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 14, marginBottom: 0 }}>
          You can change any of this later in Settings → Edit profile.
        </p>
      </div>
    </div>
  )
}

function Chip({ text, active, onClick }: { text: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={active} aria-label={text} onClick={onClick} style={chip(active)}>
      {text}
    </button>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const page: CSSProperties = {
  flex: '1 1 auto',
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
}

// Wider than AuthScreen's 380: a 23-chip grid squeezed into a login card wraps
// into a column of near-single-word rows and reads as a list, not a palette.
const card: CSSProperties = {
  width: '100%',
  maxWidth: 560,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 22,
  padding: '26px 22px',
}

const heading: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  margin: '8px 0 0',
}

const subtitle: CSSProperties = {
  fontSize: 13.5,
  color: 'var(--muted)',
  lineHeight: 1.5,
  margin: '6px 0 0',
}

// Same token choice as EditProfileView's restriction chips — the deeper
// --accent rather than --accent-fill, so 12.5px label text stays above 4.5:1.
function chip(active: boolean): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: active ? 700 : 500,
    padding: '6px 11px',
    borderRadius: 999,
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    background: active ? 'var(--accent)' : 'var(--chipbg)',
    color: active ? 'var(--accent-ink)' : 'var(--muted)',
  }
}

function primaryButton(busy: boolean): CSSProperties {
  return {
    padding: '11px 22px',
    borderRadius: 13,
    border: 'none',
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.6 : 1,
  }
}

const backButton: CSSProperties = {
  padding: '11px 16px',
  borderRadius: 13,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--muted)',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const skipButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: '11px 0',
  color: 'var(--muted)',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
}

const bannerStyle: CSSProperties = {
  fontSize: 13,
  color: '#d9534f',
  background: 'rgba(217, 83, 79, 0.10)',
  border: '1px solid rgba(217, 83, 79, 0.35)',
  borderRadius: 12,
  padding: '10px 12px',
  marginTop: 16,
}
