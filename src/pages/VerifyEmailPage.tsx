import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { confirmEmailVerification, LinkError, requestEmailVerification } from '@/api/account'
import { useAuth } from '@/auth/AuthContext'
import AuthScreen, { authButton, authLink, authLinkButton, authMuted } from '@/components/AuthScreen'

// KAN-19. The landing page for the emailed verification link. It must work signed OUT —
// the link is clicked from a mail client, which knows nothing about the session — so it
// asks nothing of the auth state except when offering to send a replacement.

type State =
  | { kind: 'working' }
  | { kind: 'verified' }
  | { kind: 'already' }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'error' }

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { status } = useAuth()

  const [state, setState] = useState<State>(() => (token ? { kind: 'working' } : { kind: 'invalid' }))
  const [resent, setResent] = useState(false)

  // The confirm is a WRITE, and React 18's development StrictMode mounts effects twice.
  // Spending the token twice would be harmless here (the second call answers
  // "already verified") but it would also flash that wording at someone who has just
  // verified for the first time, so the call is guarded to run once.
  const attempted = useRef(false)

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true

    let cancelled = false
    confirmEmailVerification(token)
      .then((outcome) => {
        if (cancelled) return
        setState({ kind: outcome === 'Verified' ? 'verified' : 'already' })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof LinkError) setState({ kind: err.failure })
        else setState({ kind: 'error' })
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const signedIn = status === 'authenticated'

  const resend = async () => {
    try {
      await requestEmailVerification()
      setResent(true)
    } catch {
      setResent(false)
    }
  }

  const footer = signedIn ? (
    <Link to="/discover" style={authLink}>
      Back to the app
    </Link>
  ) : (
    <Link to="/login" style={authLink}>
      Sign in
    </Link>
  )

  if (state.kind === 'working') {
    return (
      <AuthScreen title="Verifying your email…" subtitle="One moment." footer={footer}>
        <div aria-busy="true" style={authMuted} />
      </AuthScreen>
    )
  }

  if (state.kind === 'verified' || state.kind === 'already') {
    return (
      <AuthScreen
        title={state.kind === 'verified' ? 'Email verified' : 'Already verified'}
        // "Verified", never "confirmed": CONTEXT.md's Accounts glossary says verified is
        // said of addresses and of nothing else, and lists "confirmed email" under _Avoid_.
        subtitle={
          state.kind === 'verified'
            ? 'Thanks — this address is verified. We know we can reach you here if you ever need to get back into your account.'
            : 'This address was already verified, so there is nothing more to do.'
        }
        footer={footer}
      >
        <Link to={signedIn ? '/discover' : '/login'} style={authLinkButton}>
          {signedIn ? 'Continue' : 'Sign in'}
        </Link>
      </AuthScreen>
    )
  }

  // Expired and invalid read differently but END the same way, and that is deliberate.
  // "Invalid" here is overwhelmingly a SUPERSEDED link — the reader asked twice and
  // clicked the older message — so refusing them a replacement would strand the most
  // common case of all. The wording separates the two; the way out is the same one.
  const isExpired = state.kind === 'expired'
  const isError = state.kind === 'error'

  return (
    <AuthScreen
      title={isExpired ? 'That link has expired' : isError ? 'Something went wrong' : 'That link is not usable'}
      subtitle={
        isExpired
          ? 'Verification links last 24 hours. Ask for a fresh one and it will work straight away.'
          : isError
            ? 'We could not check that link just now. Try again in a moment.'
            : 'It may have been replaced by a newer link, or it was never a valid one.'
      }
      footer={footer}
    >
      {signedIn ? (
        <>
          <button type="button" onClick={resend} style={authButton} disabled={resent}>
            {resent ? 'Sent — check your inbox' : 'Send a new verification email'}
          </button>
          {resent && (
            <div style={{ ...authMuted, marginTop: 12 }}>
              The new link works for 24 hours. Any earlier one has stopped working.
            </div>
          )}
        </>
      ) : (
        // A guest cannot be handed the resend button: that endpoint reads the caller's OWN
        // address off their session, which is exactly what makes it impossible to abuse, and
        // exactly what this reader has not got. Asking them to type an address instead would
        // rebuild the account-enumeration surface the reset endpoint works hard not to be.
        // So the way out is a real link rather than a sentence of instructions — the offer of
        // a fresh link is one click plus a sign-in, not a scavenger hunt through settings.
        <>
          <Link to="/login" style={authLinkButton}>
            Sign in to send a new link
          </Link>
          <div style={{ ...authMuted, marginTop: 12 }}>
            Once you are signed in it is under Settings → Security.
          </div>
        </>
      )}
    </AuthScreen>
  )
}




