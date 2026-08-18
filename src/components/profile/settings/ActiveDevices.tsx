// ─────────────────────────────────────────────────────────────────────────
// Settings → Security → Active devices (KAN-20, ADR-0009).
//
// The thing a user has never had: a way to revoke their own sessions. Until now
// the only revocation lever in the app was an admin bumping TokenVersion on a
// ban, so somebody who suspected a stolen session had nothing at all.
//
// It is a LIST rather than a single "sign out everywhere" button because knowing
// WHICH device to drop is most of the value — a panic button is what you reach
// for when the list has already failed you. The panic button is here too, below
// the list, and it signs out every device except this one.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSessions, revokeOtherSessions, revokeSession, type SessionSummary } from '@/api/sessions'
import { queryKeys } from '@/api/queryKeys'
import { useAuth } from '@/auth/AuthContext'
import { cardShell, SectionLabel } from './settingsUi'

export default function ActiveDevices() {
  const queryClient = useQueryClient()
  const { logout } = useAuth()
  const [confirmingAll, setConfirmingAll] = useState(false)

  const { data, isPending, isError } = useQuery({
    queryKey: queryKeys.auth.sessions(),
    queryFn: ({ signal }) => getSessions(signal),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.auth.sessions() })

  const drop = useMutation({
    mutationFn: (session: SessionSummary) => revokeSession(session.id),
    onSuccess: (_result, session) => {
      // Dropping THIS device is the same act as logging out — the server has
      // already cleared this browser's cookies, so anything short of a real
      // sign-out would leave the app looking signed in until its next call
      // failed somewhere that had nothing to do with this screen.
      if (session.current) void logout()
      else void invalidate()
    },
  })

  const dropOthers = useMutation({
    mutationFn: revokeOtherSessions,
    onSuccess: () => {
      setConfirmingAll(false)
      void invalidate()
    },
  })

  const others = (data ?? []).filter((s) => !s.current)

  return (
    <>
      <SectionLabel style={{ marginTop: 22 }}>Active devices</SectionLabel>

      <div style={{ ...cardShell, padding: 16 }}>
        {isPending ? (
          <div style={muted}>Checking…</div>
        ) : isError || !data ? (
          <div style={muted}>We could not list your devices just now.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.map((session) => (
                <DeviceRow
                  key={session.id}
                  session={session}
                  busy={drop.isPending && drop.variables?.id === session.id}
                  onDrop={() => drop.mutate(session)}
                />
              ))}
            </div>

            {drop.isError && (
              <div role="alert" style={{ ...muted, marginTop: 10, color: '#d9534f' }}>
                We could not sign that device out. Please try again.
              </div>
            )}

            <div style={{ ...muted, marginTop: 12 }}>
              {others.length === 0
                ? 'This is the only device signed in to your account.'
                : 'If you do not recognise one of these, sign it out — it stops working straight away.'}
            </div>

            {others.length > 0 &&
              (confirmingAll ? (
                <div style={{ marginTop: 12 }}>
                  <div style={muted}>
                    {/* The count is the honest thing to show: "everywhere" is vague, and this
                        button is pressed by people who want to know exactly what it did. */}
                    This signs out {others.length} other {others.length === 1 ? 'device' : 'devices'}.
                    You will stay signed in here.
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => dropOthers.mutate()}
                      disabled={dropOthers.isPending}
                      style={{ ...dangerButton, opacity: dropOthers.isPending ? 0.6 : 1 }}
                    >
                      {dropOthers.isPending ? 'Signing out…' : 'Sign them out'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingAll(false)}
                      style={quietButton}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingAll(true)}
                  style={{ ...quietButton, width: '100%', marginTop: 12 }}
                >
                  Sign out all other devices
                </button>
              ))}
          </>
        )}
      </div>
    </>
  )
}

function DeviceRow({
  session,
  busy,
  onDrop,
}: {
  session: SessionSummary
  busy: boolean
  onDrop: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {session.label}
          {session.current && (
            <span
              style={{
                marginLeft: 8,
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                background: 'var(--tagbg)',
                color: 'var(--accent)',
              }}
            >
              This device
            </span>
          )}
        </div>
        <div style={{ ...muted, fontSize: 12, marginTop: 2 }}>
          Last used {relativeTime(session.lastSeenAtUtc)}
        </div>
      </div>

      <button
        type="button"
        onClick={onDrop}
        disabled={busy}
        // The accessible name carries the device, because a column of six
        // buttons all called "Sign out" tells a screen-reader user nothing about
        // which session they are about to end.
        aria-label={`Sign out ${session.label}`}
        style={{ ...quietButton, opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' }}
      >
        {busy ? '…' : 'Sign out'}
      </button>
    </div>
  )
}

/**
 * Deliberately coarse. This line answers "was that me, earlier today?" — so
 * minutes matter for a few hours and stop mattering after that, and the server
 * only keeps the timestamp fresh to within five minutes anyway (it is bumped
 * lazily, precisely so a devices list does not cost a write per request).
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'recently'

  const minutes = Math.floor((Date.now() - then) / 60000)
  if (minutes < 5) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`

  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

const muted: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.55,
}

const quietButton: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 11,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const dangerButton: CSSProperties = {
  ...quietButton,
  border: 'none',
  background: '#d9534f',
  color: '#fff',
}
