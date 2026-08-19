// ─────────────────────────────────────────────────────────────────────────
// The code prompt (KAN-21) — the second half of a sign-in.
//
// ONE component because there are TWO screens that raise a challenge, and they
// must behave identically: /login, and /reset-password once the account turns
// out to be enrolled. A person who has just chosen a new password and is then
// asked for a code is having the more confusing of the two experiences, and
// giving them a differently-worded second copy of this form is how that gets
// worse.
//
// ONE FIELD for both kinds of code. The server tells a six-digit authenticator
// code from a ten-character recovery code by shape, so the screen does not ask
// the user to classify their own emergency — which, at the moment somebody is
// standing there with a dead phone, is a question they should not have to
// answer before they can type anything.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import {
  answerChallenge,
  ChallengeError,
  type SecondFactorChallenge,
} from '@/api/secondFactor'
import { SubmitButton } from '@/components/AuthScreen'
import TextField from '@/components/ui/TextField'

interface Props {
  challenge: SecondFactorChallenge
  /** Called once the challenge is answered and the session is open. */
  onAnswered: () => void
  /**
   * Called when the challenge dies — five wrong codes, or it aged out. The
   * screen owning this form has to send the user back to the password step,
   * because there is nothing left here to type into.
   */
  onExpired: () => void
}

export default function SecondFactorChallengeForm({ challenge, onAnswered, onExpired }: Props) {
  const { adoptSession } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setError(null)
    setSubmitting(true)
    try {
      const auth = await answerChallenge(challenge.challengeToken, code.trim())
      // The session arrived as Set-Cookie on that response; this only tells the
      // store who is now signed in.
      adoptSession(auth)
      onAnswered()
    } catch (err) {
      if (err instanceof ChallengeError) {
        if (err.failure.kind === 'gone') {
          onExpired()
          return
        }
        setError(messageFor(err))
        setCode('')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p style={intro}>
        Open your authenticator app and enter the six-digit code it is showing. If you cannot
        reach it, one of your recovery codes works here too.
      </p>

      <TextField
        label="Authentication code"
        name="code"
        // `text`, not `number`: recovery codes contain letters, and a numeric
        // input would silently refuse half of what this field accepts.
        inputMode="text"
        autoComplete="one-time-code"
        autoFocus
        value={code}
        onChange={(event) => setCode(event.target.value)}
        error={error ?? undefined}
      />

      <SubmitButton disabled={submitting || code.trim().length === 0}>
        {submitting ? 'Checking…' : 'Continue'}
      </SubmitButton>

      {/* The way out for somebody who has lost both the phone and the codes.
          It has to be here, on the screen where they discover the problem —
          buried in settings it would be behind the sign-in they cannot finish. */}
      <div style={{ textAlign: 'center', marginTop: 14 }}>
        <Link to="/reset-second-factor" style={linkStyle}>
          Lost your authenticator?
        </Link>
      </div>
    </form>
  )
}

/**
 * What each failure means to the person reading it.
 *
 * The throttled case is the one worth getting right: ADR-0008 chose an
 * escalating delay over a lockout precisely BECAUSE a recovery code still works
 * while the delay runs, so a message that says only "wait" would describe the
 * app as the lockout it deliberately is not.
 */
function messageFor(err: ChallengeError): string {
  switch (err.failure.kind) {
    case 'throttled':
      return `Too many attempts — try again in ${describeWait(err.failure.retryAfterSeconds)}. A recovery code still works right now.`
    case 'invalid':
      // No count when the server did not send one. "0 attempts left" under a form that
      // still works is a worse thing to read than no number at all.
      if (err.failure.attemptsRemaining === null) return 'That code was not right.'
      return err.failure.attemptsRemaining === 1
        ? 'That code was not right. One more wrong code and you will have to sign in again.'
        : `That code was not right. ${err.failure.attemptsRemaining} attempts left.`
    default:
      return 'That code was not right.'
  }
}

function describeWait(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? 'a second' : `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}

const intro: CSSProperties = {
  margin: '0 0 18px',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: 'var(--muted)',
}

const linkStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
}
