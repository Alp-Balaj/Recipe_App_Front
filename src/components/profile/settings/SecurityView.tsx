// ─────────────────────────────────────────────────────────────────────────
// Settings → Security (KAN-19). Unlike its neighbours in this folder, this
// screen shows SERVER truth rather than device-local preferences: whether the
// account's email address has been verified, and a way to prove it if not.
//
// It is a sub-view of the existing settings navigation — which is local state,
// not routing — so it needs no route of its own.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getEmailVerificationStatus, requestEmailVerification } from '@/api/account'
import { queryKeys } from '@/api/queryKeys'
import { cardShell, SectionLabel, SettingsScreen } from './settingsUi'

export default function SecurityView({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient()
  const [sent, setSent] = useState(false)

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.auth.emailVerification(),
    queryFn: ({ signal }) => getEmailVerificationStatus(signal),
  })

  const send = useMutation({
    mutationFn: requestEmailVerification,
    onSuccess: () => {
      setSent(true)
      // The request is a no-op for an already-verified address, and the status may have
      // changed in another tab meanwhile — so re-read rather than assume.
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.emailVerification() })
    },
  })

  return (
    <SettingsScreen title="Security" onBack={onBack}>
      <SectionLabel>Email address</SectionLabel>
      <div style={{ ...cardShell, padding: 16 }}>
        {isPending ? (
          <div style={muted}>Checking…</div>
        ) : isError || !data ? (
          <div style={muted}>We could not check your email status just now.</div>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, wordBreak: 'break-all' }}>{data.email}</div>
            <div
              style={{
                display: 'inline-block',
                marginTop: 8,
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 700,
                background: data.verified ? 'var(--tagbg)' : 'var(--surface2)',
                color: data.verified ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {data.verified ? '✓ Verified' : 'Not verified'}
            </div>

            <div style={{ ...muted, marginTop: 12 }}>
              {/* Both lines have to stay TRUE of what the server actually does. Password
                  reset is not gated on verification, so "you cannot recover this account
                  until you verify" would simply be false — the real value of verifying is
                  that it proves the address is reachable and not a typo, before the day you
                  need it to be. */}
              {data.verified
                ? 'We know we can reach you here, so this address can be used to get back into your account.'
                : 'Nobody has verified this address yet, so it could be a typo — and a reset link sent to a typo never arrives. Verifying it now settles that before you need it.'}
            </div>

            {!data.verified && (
              <button
                type="button"
                onClick={() => send.mutate()}
                disabled={send.isPending || sent}
                style={{ ...primaryButton, opacity: send.isPending || sent ? 0.6 : 1 }}
              >
                {sent
                  ? 'Sent — check your inbox'
                  : send.isPending
                    ? 'Sending…'
                    : 'Send verification email'}
              </button>
            )}

            {sent && (
              <div style={{ ...muted, marginTop: 10 }}>
                The link works for 24 hours. Any earlier one has stopped working.
              </div>
            )}

            {send.isError && (
              <div role="alert" style={{ ...muted, marginTop: 10, color: '#d9534f' }}>
                We could not send that email. Please try again.
              </div>
            )}
          </>
        )}
      </div>
    </SettingsScreen>
  )
}

const muted: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.55,
}

const primaryButton: CSSProperties = {
  width: '100%',
  marginTop: 14,
  padding: '11px 14px',
  borderRadius: 13,
  border: 'none',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
