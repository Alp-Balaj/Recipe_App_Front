// ─────────────────────────────────────────────────────────────────────────
// /reset-second-factor (KAN-21) — the slowest rung of the recovery ladder.
//
// ONE page for both halves of the flow, keyed off `?token=`, following the same
// shape KAN-19's screens use: no token means "ask for the link", a token means
// "you clicked it". Splitting them would be two routes whose only difference is
// which sentence they open with.
//
// THE HARDEST THING THIS SCREEN HAS TO DO IS NOT LOOK FINISHED. Clicking the
// link does not remove anything — it starts a 48-hour wait — and a page that
// says "done" leaves someone sitting at a sign-in screen wondering why their
// password is still not enough. Both halves lead with the wait, and both point
// at the recovery code first, because that path is instant and this one is not.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  confirmSecondFactorReset,
  requestSecondFactorReset,
  ResetLinkError,
} from '@/api/secondFactor'
import AuthScreen, { authLink, SubmitButton } from '@/components/AuthScreen'
import TextField from '@/components/ui/TextField'

export default function ResetSecondFactorPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  return token ? <ConfirmHalf token={token} /> : <RequestHalf />
}

const signInLink = (
  <Link to="/login" style={authLink}>
    Back to sign in
  </Link>
)

/** No token: ask for the link. */
function RequestHalf() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setBanner(null)
    setSubmitting(true)
    try {
      await requestSecondFactorReset(email.trim())
      setSent(true)
    } catch {
      setBanner('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle="If that address has an account with two-step sign-in, a link is on its way."
        footer={signInLink}
      >
        {/* Worded so it is true whether or not the address had an account. The
            server answers identically either way on purpose — otherwise this
            page would tell a stranger who has an account here and which accounts
            are worth attacking a mailbox for. */}
        <p style={body}>
          The link works once and lasts an hour. Opening it starts a{' '}
          <strong>48-hour wait</strong> — two-step sign-in stays on until then, and we will
          email you when it comes off.
        </p>
        <p style={body}>
          If you can still find a recovery code, use that instead. It signs you in straight
          away, with no wait at all.
        </p>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title="Lost your authenticator?"
      subtitle="We can turn two-step sign-in off — but not immediately."
      banner={banner}
      footer={signInLink}
    >
      <p style={body}>
        <strong>Try a recovery code first.</strong> You were given ten when you set this up,
        and any unused one signs you in right now. This page is for when those are gone too.
      </p>
      <p style={body}>
        Because this route runs entirely through your email, turning the second factor off
        takes <strong>48 hours</strong> — long enough that if somebody else started it, you
        will see the warning and can stop it.
      </p>

      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Your email address"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <SubmitButton disabled={submitting || email.trim().length === 0}>
          {submitting ? 'Sending…' : 'Email me a link'}
        </SubmitButton>
      </form>
    </AuthScreen>
  )
}

/** A token in the URL: spend it and start the clock. */
function ConfirmHalf({ token }: { token: string }) {
  const [state, setState] = useState<
    { kind: 'working' } | { kind: 'scheduled'; effectiveAtUtc: string } | { kind: 'dead'; failure: 'expired' | 'invalid' }
  >({ kind: 'working' })

  // The confirm is a WRITE and the token is SINGLE-USE, so it must be sent exactly once.
  // React 18's development StrictMode mounts effects twice; without this ref the first POST
  // spends the link and starts the 48-hour countdown, the second gets a 400, and the page
  // tells the reader their link was never usable while the clock is in fact already running.
  //
  // AND THERE IS DELIBERATELY NO `cancelled` FLAG beside it, which is the half that is easy
  // to get wrong — the two fight. StrictMode's sequence is: effect, cleanup, effect. A
  // cancel-on-cleanup flag is set by that middle step, and the re-run returns early on this
  // ref, so the in-flight response is discarded by a component that will never ask again and
  // the screen sits on "One moment" forever. One request per mount is a strong enough
  // guarantee on its own, and React 18 does not warn about the late setState.
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    // Fired from an effect deliberately, unlike every ordinary mutation in this
    // app: the user's action WAS clicking the link, and asking them to press a
    // second button to confirm what they already confirmed in their mail client
    // is a step that teaches nothing.
    confirmSecondFactorReset(token)
      .then((scheduled) => setState({ kind: 'scheduled', effectiveAtUtc: scheduled.effectiveAtUtc }))
      .catch((err) =>
        setState({
          kind: 'dead',
          failure: err instanceof ResetLinkError ? err.failure : 'invalid',
        }),
      )
  }, [token])

  if (state.kind === 'working') {
    return (
      <AuthScreen title="One moment" subtitle="Checking that link…" footer={signInLink}>
        <p style={body}>This only takes a second.</p>
      </AuthScreen>
    )
  }

  if (state.kind === 'dead') {
    return (
      <AuthScreen
        title={state.failure === 'expired' ? 'That link has expired' : 'That link is not usable'}
        subtitle={
          state.failure === 'expired'
            ? 'These links last an hour. Ask for a new one and it will work straight away.'
            : 'It may have been used already, or replaced by a newer one.'
        }
        footer={signInLink}
      >
        <Link to="/reset-second-factor" style={body}>
          Send a new link
        </Link>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
      title="The clock has started"
      subtitle="Two-step sign-in is still on. It comes off on the date below."
      footer={signInLink}
    >
      {/* The date, spelled out and up front. "Scheduled" on its own reads as
          "done" to somebody who is in a hurry, and they will spend the next two
          days trying to sign in with their password. */}
      <p style={{ ...body, fontWeight: 800, fontSize: 15 }}>
        {formatDeadline(state.effectiveAtUtc)}
      </p>
      <p style={body}>
        Until then, nothing has changed: your authenticator and your recovery codes both
        still work, and either one gets you in now rather than in two days.
      </p>
      <p style={body}>
        We have emailed the account to say this is happening. If it was not you who asked,
        sign in and cancel it from <strong>Settings → Security</strong> — cancelling takes one
        click and you can do it as many times as you need.
      </p>
    </AuthScreen>
  )
}

/** In the reader's own time zone, with the date spelled out — see the copy note above. */
function formatDeadline(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime())
    ? 'in about two days'
    : when.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

const body: CSSProperties = {
  margin: '0 0 14px',
  fontSize: 13.5,
  lineHeight: 1.6,
  color: 'var(--muted)',
}
