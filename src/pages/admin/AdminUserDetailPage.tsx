// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream FE-2, Task 16) — a single user's identity, moderation
// state, AI usage, and role/moderation actions. Reached from AdminUsersTab's
// rows (and, once FE-1/FE-4 land, from the dashboard's top consumers and the
// reports queue's target-author context).
//
// Promote/demote route their own conflicts through the SAME useAdminMutation
// path every other action here uses, but need bespoke 403/409 copy ("you
// can't change your own role" / "role already changed") instead of the
// generic admin-action messages. Rather than growing useAdminMutation (or
// adminErrorMessage's signature) a context parameter — which would touch
// shared code every OTHER tab also depends on — withRoleContext below tags
// the thrown error with `.adminAction` before it reaches useAdminMutation's
// onError; adminErrorMessage's one extension (see adminShared.tsx) reads that
// tag. Nothing about the shared hook or its call shape changes.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import {
  banUser,
  demoteUser,
  getAdminUser,
  getAdminUserUsage,
  promoteUser,
  suspendUser,
  unbanUser,
  unsuspendUser,
} from '@/api/admin'
import { alertStyle, countsRow, CountTile, linkBtn, listCard, mutedNote, useAdminMutation } from './adminShared'

/** Tags a thrown error so adminErrorMessage can give it promote/demote-specific copy. */
function withRoleContext<T>(context: 'promote' | 'demote', fn: () => Promise<T>): Promise<T> {
  return fn().catch((err) => {
    if (err && typeof err === 'object') {
      ;(err as Record<string, unknown>).adminAction = context
    }
    throw err
  })
}

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { mutate, isPending, error } = useAdminMutation()
  const [suspendDays, setSuspendDays] = useState(7)
  const [suspendReason, setSuspendReason] = useState('')

  const userQuery = useQuery({
    queryKey: queryKeys.admin.user(id ?? ''),
    queryFn: () => getAdminUser(id as string),
    enabled: !!id,
  })
  const usageQuery = useQuery({
    queryKey: queryKeys.admin.userUsage(id ?? ''),
    queryFn: () => getAdminUserUsage(id as string),
    enabled: !!id,
  })

  if (!id) {
    return <div style={mutedNote}>No user specified.</div>
  }

  if (userQuery.isLoading) {
    return <div style={mutedNote}>Loading user…</div>
  }

  const u = userQuery.data
  if (userQuery.isError || !u) {
    return (
      <div style={mutedNote}>
        Couldn't load this user.{' '}
        <button onClick={() => userQuery.refetch()} style={linkBtn}>
          Try again
        </button>
      </div>
    )
  }

  const isSuspendedNow = !!u.suspendedUntilUtc && new Date(u.suspendedUntilUtc).getTime() > Date.now()
  const usage = usageQuery.data
  const usageNotFound = usageQuery.error instanceof ApiError && usageQuery.error.status === 404

  const onSuspend = (e: React.FormEvent) => {
    e.preventDefault()
    const days = Math.min(365, Math.max(1, Math.round(suspendDays) || 1))
    mutate(() => suspendUser(id, days, suspendReason.trim() || undefined))
  }

  const onBan = () => {
    const reason = window.prompt('Reason for ban (optional):')
    if (reason === null) return // cancelled
    mutate(() => banUser(id, reason.trim() || undefined))
  }

  const onPromote = () => {
    if (!window.confirm(`Promote ${u.username} to admin?`)) return
    mutate(() => withRoleContext('promote', () => promoteUser(id)))
  }

  const onDemote = () => {
    if (!window.confirm(`Demote ${u.username} to a regular user?`)) return
    mutate(() => withRoleContext('demote', () => demoteUser(id)))
  }

  return (
    <div>
      <Link to="/admin/users" style={linkBtn}>
        ← Back to users
      </Link>

      <div style={identityCard}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{u.username}</div>
          <Badge variant={u.role === 'Admin' ? 'default' : 'outline'}>{u.role}</Badge>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{u.email}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          Joined {new Date(u.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
        <div style={countsRow}>
          <CountTile label="Recipes" value={u.recipeCount} />
          <CountTile label="Open reports against" value={u.openReportsAgainst} accent={u.openReportsAgainst > 0} />
        </div>
      </div>

      {(u.isBanned || isSuspendedNow) && (
        <div style={moderationBanner}>
          {u.isBanned
            ? 'This user is banned.'
            : `This user is suspended until ${new Date(u.suspendedUntilUtc as string).toLocaleString()}.`}
        </div>
      )}

      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}

      <div style={listCard}>
        <div style={sectionTitle}>AI usage</div>
        {usageQuery.isLoading ? (
          <div style={mutedNote}>Loading usage…</div>
        ) : usageNotFound ? (
          <div style={mutedNote}>No AI usage recorded yet.</div>
        ) : usageQuery.isError || !usage ? (
          <div style={mutedNote}>
            Couldn't load usage.{' '}
            <button onClick={() => usageQuery.refetch()} style={linkBtn}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div style={countsRow}>
              <CountTile label="Today calls" value={usage.todayCalls} />
              <CountTile label="Today tokens" value={usage.todayTokens} />
              <CountTile label="All-time tokens" value={usage.allTimeTokens} />
            </div>
            <div style={mutedNote}>
              {usage.budget.callsRemaining.toLocaleString()} calls / {usage.budget.tokensRemaining.toLocaleString()} tokens
              remaining · resets {new Date(usage.budget.resetsAtUtc).toLocaleString()}
            </div>
          </>
        )}
      </div>

      <div style={listCard}>
        <div style={sectionTitle}>Actions</div>

        <div style={actionsRow}>
          {u.isBanned ? (
            <button disabled={isPending} onClick={() => mutate(() => unbanUser(id))} style={ghostBtn}>
              Unban
            </button>
          ) : (
            <button disabled={isPending} onClick={onBan} style={dangerBtn}>
              Ban
            </button>
          )}

          {isSuspendedNow ? (
            <button disabled={isPending} onClick={() => mutate(() => unsuspendUser(id))} style={ghostBtn}>
              Unsuspend
            </button>
          ) : null}

          {u.role === 'Admin' ? (
            <button disabled={isPending} onClick={onDemote} style={ghostBtn}>
              Demote to user
            </button>
          ) : (
            <button disabled={isPending} onClick={onPromote} style={ghostBtn}>
              Promote to admin
            </button>
          )}
        </div>

        {u.role === 'Admin' && (
          <div style={mutedNote}>Config-listed admins regain the role at next login.</div>
        )}

        {!isSuspendedNow && !u.isBanned && (
          <form onSubmit={onSuspend} style={suspendForm}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>Suspend</span>
            <input
              type="number"
              min={1}
              max={365}
              value={suspendDays}
              onChange={(e) => setSuspendDays(Number(e.target.value))}
              aria-label="Suspension days"
              style={daysInput}
            />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>days</span>
            <input
              type="text"
              placeholder="Reason (optional)"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              aria-label="Suspension reason"
              style={reasonInput}
            />
            <button type="submit" disabled={isPending} style={dangerBtn}>
              Suspend
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Styles (detail-page-local; not shared, so they stay here rather than in adminShared) ──

const identityCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '14px 16px',
  margin: '10px 0 12px',
}

const sectionTitle: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  fontWeight: 700,
  marginBottom: 8,
}

const moderationBanner: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: '#d9534f',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 11,
  padding: '9px 12px',
  marginBottom: 12,
}

const actionsRow: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' }

const suspendForm: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 12,
  paddingTop: 12,
  borderTop: '1px solid var(--border)',
}

const daysInput: CSSProperties = {
  width: 60,
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 12.5,
}

const reasonInput: CSSProperties = {
  flex: 1,
  minWidth: 120,
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '6px 8px',
  fontFamily: 'inherit',
  fontSize: 12.5,
}

const smallBtnBase: CSSProperties = {
  cursor: 'pointer',
  borderRadius: 10,
  padding: '7px 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
}

const ghostBtn: CSSProperties = {
  ...smallBtnBase,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--muted)',
}

const dangerBtn: CSSProperties = {
  ...smallBtnBase,
  border: 'none',
  background: '#d9534f',
  color: '#fff',
}
