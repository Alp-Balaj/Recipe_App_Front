// ─────────────────────────────────────────────────────────────────────────
// Settings → Security → two-step sign-in (KAN-21).
//
// Everything an account holder can do to their own second factor: turn it on,
// see it, replace its recovery codes, turn it off, and stop a reset somebody
// started by email.
//
// The screen is a small state machine rather than a page of always-visible
// controls, because enrolment has a MIDDLE — a secret exists, but the factor
// does not yet — and that middle is exactly where a user needs the screen to
// show one thing and not five. The states are: idle (on or off), scanning,
// showing the codes once, and confirming a removal.
//
// THE CODES ARE SHOWN ONCE, and the copy says so in the imperative rather than
// as a note. There is no endpoint that repeats them; the only thing this app can
// offer someone who did not write them down is a fresh set, which invalidates
// the ones they did not write down.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import { queryKeys } from '@/api/queryKeys'
import {
  beginSecondFactorEnrolment,
  cancelSecondFactorReset,
  confirmSecondFactorEnrolment,
  disableSecondFactor,
  getSecondFactorStatus,
  reissueRecoveryCodes,
  type SecondFactorEnrolment,
} from '@/api/secondFactor'
import { useAuth } from '@/auth/AuthContext'
import { cardShell, SectionLabel } from './settingsUi'

type Mode =
  | { kind: 'idle' }
  | { kind: 'scanning'; enrolment: SecondFactorEnrolment }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'disabling' }
  | { kind: 'reissuing' }

export default function SecondFactorPanel() {
  const queryClient = useQueryClient()
  const { refreshIdentity } = useAuth()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.auth.secondFactor(),
    queryFn: ({ signal }) => getSecondFactorStatus(signal),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.secondFactor() })

  const reset = () => {
    setMode({ kind: 'idle' })
    setCode('')
    setError(null)
  }

  const begin = useMutation({
    mutationFn: beginSecondFactorEnrolment,
    onSuccess: (enrolment) => {
      setError(null)
      setMode({ kind: 'scanning', enrolment })
    },
    // The 409 says "cannot enrol" without saying why, on purpose — the status
    // read below answers that properly, and two places answering it is two
    // places that can disagree. So the screen re-reads rather than guessing.
    onError: () => {
      setError('We could not start setup just now.')
      refresh()
    },
  })

  const confirm = useMutation({
    mutationFn: () => confirmSecondFactorEnrolment(code.trim()),
    onSuccess: (result) => {
      setCode('')
      setError(null)
      setMode({ kind: 'codes', codes: result.codes })
      refresh()
    },
    onError: () => setError('That code was not right. Check your authenticator and try again.'),
  })

  const disable = useMutation({
    mutationFn: () => disableSecondFactor(code.trim()),
    onSuccess: () => {
      reset()
      refresh()
    },
    onError: () => setError('That code was not right.'),
  })

  const reissue = useMutation({
    mutationFn: () => reissueRecoveryCodes(code.trim()),
    onSuccess: (result) => {
      setCode('')
      setError(null)
      setMode({ kind: 'codes', codes: result.codes })
      refresh()
    },
    onError: () => setError('That code was not right.'),
  })

  const cancelReset = useMutation({
    mutationFn: cancelSecondFactorReset,
    onSuccess: async () => {
      setError(null)
      await refresh()
      // The pending reset is also on IDENTITY, which is what the app-wide red strip
      // reads. Without this the panel's alarm clears while that strip stays up for the
      // rest of the session, telling the user their account is still counting down.
      await refreshIdentity()
    },
    // On the one action that saves the account, silence is the wrong answer: a button
    // that re-enables with no message reads as "it worked" to everybody.
    onError: () =>
      setError('We could not cancel that request. Please try again — the countdown is still running.'),
  })

  return (
    <>
      <SectionLabel>Two-step sign-in</SectionLabel>
      <div style={{ ...cardShell, padding: 16 }}>
        {isPending ? (
          <div style={muted}>Checking…</div>
        ) : isError || !data ? (
          <div style={muted}>We could not check your security settings just now.</div>
        ) : (
          <>
            {/* The warning that has to be impossible to miss. Someone started the
                48-hour countdown to strip this account's second factor, and the
                person reading this is the only one who can stop it — because
                stopping it requires being signed in, which requires the factor. */}
            {data.resetEffectiveAtUtc && (
              <div role="alert" style={alarm}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>
                  Someone asked to turn off two-step sign-in
                </div>
                <div style={{ lineHeight: 1.55 }}>
                  Unless you stop it, two-step sign-in comes off this account on{' '}
                  <strong>{formatDeadline(data.resetEffectiveAtUtc)}</strong>. If that was not
                  you, cancel it now — and change your password, because whoever asked can read
                  your email.
                </div>
                <button
                  type="button"
                  onClick={() => cancelReset.mutate()}
                  disabled={cancelReset.isPending}
                  style={{ ...primaryButtonWide, marginTop: 12 }}
                >
                  {cancelReset.isPending ? 'Cancelling…' : 'Cancel that request'}
                </button>
              </div>
            )}

            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {data.enrolled ? '✓ On' : 'Off'}
            </div>
            <div style={{ ...muted, marginTop: 8 }}>
              {data.enrolled
                ? `Signing in asks for a code from your authenticator app. ${data.recoveryCodesRemaining} recovery ${data.recoveryCodesRemaining === 1 ? 'code' : 'codes'} left.`
                : 'Your password is the only thing in front of this account. An authenticator app adds a second step that a stolen password cannot pass.'}
            </div>

            {error && (
              <div role="alert" style={{ ...muted, marginTop: 10, color: ERROR_COLOR }}>
                {error}
              </div>
            )}

            {mode.kind === 'idle' && !data.enrolled && (
              <>
                {/* Enrolment needs a verified email because email is one of the
                    recovery paths — explained BEFORE the button rather than as a
                    failure after it. */}
                {data.emailVerified ? (
                  <button
                    type="button"
                    onClick={() => begin.mutate()}
                    disabled={begin.isPending}
                    style={primaryButtonWide}
                  >
                    {begin.isPending ? 'Starting…' : 'Set up an authenticator app'}
                  </button>
                ) : (
                  <div style={{ ...muted, marginTop: 12 }}>
                    Verify your email address first — it is one of the ways back in if you lose
                    your phone, so we will not switch this on behind an address nobody has
                    confirmed.
                  </div>
                )}
              </>
            )}

            {mode.kind === 'scanning' && (
              <ScanStep
                enrolment={mode.enrolment}
                code={code}
                onCode={setCode}
                busy={confirm.isPending}
                onConfirm={() => confirm.mutate()}
                onCancel={reset}
              />
            )}

            {mode.kind === 'codes' && <CodesStep codes={mode.codes} onDone={reset} />}

            {mode.kind === 'idle' && data.enrolled && (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setMode({ kind: 'reissuing' })} style={secondaryButton}>
                  New recovery codes
                </button>
                <button type="button" onClick={() => setMode({ kind: 'disabling' })} style={dangerButton}>
                  Turn off
                </button>
              </div>
            )}

            {(mode.kind === 'disabling' || mode.kind === 'reissuing') && (
              <CodeStep
                title={
                  mode.kind === 'disabling'
                    ? 'Enter a current code to turn two-step sign-in off.'
                    : 'Enter a current code to replace your recovery codes.'
                }
                note={
                  mode.kind === 'disabling'
                    ? 'Removing the second factor is exactly the act that should have to produce one. A recovery code works here too.'
                    : 'Your existing recovery codes stop working the moment the new ones appear.'
                }
                code={code}
                onCode={setCode}
                busy={disable.isPending || reissue.isPending}
                confirmLabel={mode.kind === 'disabling' ? 'Turn off two-step sign-in' : 'Replace recovery codes'}
                danger={mode.kind === 'disabling'}
                onConfirm={() => (mode.kind === 'disabling' ? disable.mutate() : reissue.mutate())}
                onCancel={reset}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Step one of enrolment: scan (or type) the secret, then prove a code from it. */
function ScanStep({
  enrolment,
  code,
  onCode,
  busy,
  onConfirm,
  onCancel,
}: {
  enrolment: SecondFactorEnrolment
  code: string
  onCode: (value: string) => void
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={muted}>
        Scan this with your authenticator app, then type the six-digit code it shows.
      </div>

      {/* A white plate under the QR, in both themes. A dark-mode QR rendered in
          the page's own colours is a QR most cameras will not read. */}
      <div style={qrPlate}>
        <QRCodeSVG value={enrolment.otpAuthUri} size={168} level="M" marginSize={0} />
      </div>

      <details style={{ marginTop: 12 }}>
        <summary style={{ ...muted, cursor: 'pointer', fontWeight: 700 }}>
          Can’t scan it?
        </summary>
        <div style={{ ...muted, marginTop: 8 }}>Enter this key into your app by hand:</div>
        <code style={secretStyle}>{groupSecret(enrolment.secret)}</code>
      </details>

      <input
        aria-label="Six-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => onCode(event.target.value)}
        placeholder="123456"
        style={codeInput}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={onConfirm} disabled={busy || code.trim().length === 0} style={primaryButton}>
          {busy ? 'Checking…' : 'Turn on two-step sign-in'}
        </button>
        <button type="button" onClick={onCancel} style={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** The one and only appearance of a set of recovery codes. */
function CodesStep({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800 }}>Save your recovery codes</div>
      <div style={{ ...muted, marginTop: 6 }}>
        Each one signs you in once if you cannot reach your authenticator. This is the only
        time they are shown — write them down or print them now. If you lose them as well as
        your phone, the only way back takes two days.
      </div>

      <ul style={codeList}>
        {codes.map((entry) => (
          <li key={entry} style={codeItem}>
            {entry}
          </li>
        ))}
      </ul>

      <button type="button" onClick={onDone} style={primaryButtonWide}>
        I have saved them
      </button>
    </div>
  )
}

/** The shared "prove a code first" step in front of turning off and reissuing. */
function CodeStep({
  title,
  note,
  code,
  onCode,
  busy,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  note: string
  code: string
  onCode: (value: string) => void
  busy: boolean
  confirmLabel: string
  danger: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</div>
      <div style={{ ...muted, marginTop: 6 }}>{note}</div>

      <input
        aria-label="Current code"
        inputMode="text"
        autoComplete="one-time-code"
        value={code}
        onChange={(event) => onCode(event.target.value)}
        placeholder="123456"
        style={codeInput}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || code.trim().length === 0}
          style={danger ? dangerButton : primaryButton}
        >
          {busy ? 'Checking…' : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} style={secondaryButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Base32 in groups of four, because people transcribe it by hand. */
function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * A deadline stated in the reader's own time zone, with the date spelled out.
 * "In 2 days" would be worse here: the question is whether there is still time
 * to act, and a wall-clock answer is the one somebody can plan around.
 */
function formatDeadline(iso: string): string {
  const when = new Date(iso)
  return Number.isNaN(when.getTime())
    ? 'soon'
    : when.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

const ERROR_COLOR = '#d9534f'

const muted: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.55,
}

const alarm: CSSProperties = {
  fontSize: 13,
  color: 'var(--text)',
  background: 'rgba(217, 83, 79, 0.10)',
  border: '1px solid rgba(217, 83, 79, 0.35)',
  borderRadius: 14,
  padding: '12px 14px',
  marginBottom: 14,
}

const qrPlate: CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  padding: 12,
  borderRadius: 14,
  background: '#ffffff',
  border: '1px solid var(--border)',
  lineHeight: 0,
}

const secretStyle: CSSProperties = {
  display: 'block',
  marginTop: 8,
  padding: '10px 12px',
  borderRadius: 12,
  background: 'var(--surface2)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  letterSpacing: '0.08em',
  wordBreak: 'break-all',
}

const codeInput: CSSProperties = {
  width: '100%',
  marginTop: 12,
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  fontSize: 16,
  letterSpacing: '0.12em',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  outline: 'none',
}

const codeList: CSSProperties = {
  listStyle: 'none',
  margin: '14px 0',
  padding: 14,
  borderRadius: 14,
  background: 'var(--surface2)',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
}

const codeItem: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13.5,
  letterSpacing: '0.06em',
}

const buttonBase: CSSProperties = {
  padding: '11px 14px',
  borderRadius: 13,
  border: 'none',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const primaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

/** The same button when it stands alone rather than beside a Cancel. */
const primaryButtonWide: CSSProperties = { ...primaryButton, width: '100%', marginTop: 14 }

const secondaryButton: CSSProperties = {
  ...buttonBase,
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
}

const dangerButton: CSSProperties = {
  ...buttonBase,
  background: 'rgba(217, 83, 79, 0.12)',
  color: ERROR_COLOR,
  border: `1px solid ${ERROR_COLOR}`,
}
