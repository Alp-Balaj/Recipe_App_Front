// ─────────────────────────────────────────────────────────────────────────
// stream D (governor) — the admin surface: three honest counts, the report
// triage queue, and the append-only audit trail. Deliberately not a chart
// dashboard (band 03 part 4).
//
// Role-gating here is UX only — the backend's AdminOnly policy is the real
// boundary, and every call below 403s for a non-admin. The page renders a
// full-page denial rather than pretending the route doesn't exist.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import StateBlock from '@/components/ui/StateBlock'
import { Badge } from '@/components/ui/badge'
import { queryKeys } from '@/api/queryKeys'
import { ApiError, ApiConflictError } from '@/api/client'
import { timeAgo } from '@/lib/time'
import type { ReportResponse, ReportStatus } from '@/api/reports'
import {
  banUser,
  dismissReport,
  getAdminAudit,
  getAdminOverview,
  getAdminReports,
  hideRecipe,
  removeComment,
  resolveReport,
  restoreRecipe,
  suspendUser,
} from '@/api/admin'

const STATUSES: ReportStatus[] = ['Open', 'Resolved', 'Dismissed']

function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiConflictError) {
    return 'Already in that state — someone (maybe you) got there first. Refreshing.'
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'That account is an admin — not moderatable from here.'
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'That target no longer exists.'
  }
  return 'The action failed. Try again.'
}

export default function AdminPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  if (user?.role !== 'Admin') {
    return (
      <StateBlock
        variant="page"
        title="Admins only"
        body="This surface is for moderation. If you think you should have access, an existing admin (or the Admin:Emails config) grants it."
        action={{ label: 'Back to Discover', onClick: () => navigate('/discover', { replace: true }) }}
      />
    )
  }

  return <AdminDashboard />
}

function AdminDashboard() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<ReportStatus>('Open')
  const [error, setError] = useState<string | null>(null)

  const overview = useQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: getAdminOverview,
  })

  const reports = useInfiniteQuery({
    queryKey: queryKeys.admin.reports(status),
    queryFn: ({ pageParam }) => getAdminReports({ status, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const audit = useQuery({
    queryKey: queryKeys.admin.audit(),
    queryFn: () => getAdminAudit({ limit: 20 }),
  })

  // Every admin action invalidates the whole admin subtree (counts move, the
  // queue moves, the audit log grows). Hide/restore also touches what the
  // catalogue shows, so the recipe caches go too.
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all })
    },
    onError: (err) => {
      setError(adminErrorMessage(err))
      // A 409 means the cached state is stale — refetch so the queue tells the truth.
      if (err instanceof ApiConflictError) {
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
      }
    },
  })

  const items = reports.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div className="scroll" style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Admin</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 14px' }}>
        Reports in, actions out — every action lands in the audit log.
      </div>

      {/* The three counts */}
      <div style={countsRow}>
        <CountTile label="Users" value={overview.data?.totalUsers} />
        <CountTile label="Live recipes" value={overview.data?.totalRecipes} />
        <CountTile label="Open reports" value={overview.data?.openReports} accent />
      </div>

      {/* Queue */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }} role="group" aria-label="Report status">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            style={status === s ? scopeTabOn : scopeTab}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" style={alertStyle}>
          {error}
        </div>
      )}

      {reports.isLoading ? (
        <div style={mutedNote}>Loading reports…</div>
      ) : reports.isError ? (
        <div style={mutedNote}>
          Couldn't load the queue.{' '}
          <button onClick={() => reports.refetch()} style={linkBtn}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={mutedNote}>
          {status === 'Open' ? 'Inbox zero — nothing reported.' : `No ${status.toLowerCase()} reports.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              busy={act.isPending}
              onAction={(fn) => act.mutate(fn)}
            />
          ))}
          {reports.hasNextPage && (
            <button
              onClick={() => reports.fetchNextPage()}
              disabled={reports.isFetchingNextPage}
              style={{ ...linkBtn, alignSelf: 'flex-start' }}
            >
              {reports.isFetchingNextPage ? 'Loading…' : 'More reports'}
            </button>
          )}
        </div>
      )}

      {/* Audit trail */}
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, margin: '22px 0 8px' }}>
        Recent admin actions
      </div>
      {audit.isLoading ? (
        <div style={mutedNote}>Loading…</div>
      ) : (audit.data?.items.length ?? 0) === 0 ? (
        <div style={mutedNote}>No actions yet — the log starts with the first one.</div>
      ) : (
        <div style={listCard}>
          {audit.data!.items.map((entry) => (
            <div key={entry.id} style={auditRow}>
              <span style={{ fontWeight: 700 }}>{entry.actorUsername}</span>
              <span style={{ color: 'var(--muted)' }}>{describeAction(entry.action)}</span>
              {entry.detail && <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>— {entry.detail}</span>}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, flexShrink: 0 }}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function describeAction(action: string): string {
  switch (action) {
    case 'ReportResolved': return 'resolved a report'
    case 'ReportDismissed': return 'dismissed a report'
    case 'RecipeHidden': return 'hid a recipe'
    case 'RecipeRestored': return 'restored a recipe'
    case 'CommentRemoved': return 'removed a comment'
    case 'UserSuspended': return 'suspended a user'
    case 'UserUnsuspended': return 'lifted a suspension'
    case 'UserBanned': return 'banned a user'
    case 'UserUnbanned': return 'unbanned a user'
    default: return action
  }
}

function ReportCard({
  report,
  busy,
  onAction,
}: {
  report: ReportResponse
  busy: boolean
  onAction: (fn: () => Promise<unknown>) => void
}) {
  const open = report.status === 'Open'
  const targetId = report.targetId
  const automated = report.source === 'Automated'

  return (
    <div style={reportCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge variant="outline">{report.reason}</Badge>
        {/* Stream X: an auto-flag sits in the same queue as a human report and is
            actioned identically — the badge only says where the signal came from,
            and the confidence says how much to trust it before reading further. */}
        {automated && (
          <Badge variant="outline">
            Auto{typeof report.confidence === 'number' ? ` · ${Math.round(report.confidence * 100)}%` : ''}
          </Badge>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {report.targetType} ·{' '}
          {automated ? 'flagged automatically' : `reported by ${report.reporter.username}`} ·{' '}
          {timeAgo(report.createdAt)}
        </span>
      </div>

      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 7, overflowWrap: 'anywhere' }}>
        {report.targetSummary}
      </div>
      {report.details && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, overflowWrap: 'anywhere' }}>
          “{report.details}”
        </div>
      )}
      {!open && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          {report.status} {report.resolvedByUsername ? `by ${report.resolvedByUsername}` : ''}
          {report.resolutionNote ? ` — ${report.resolutionNote}` : ''}
        </div>
      )}

      {open && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {/* Target action first — the thing the report is asking for. */}
          {report.targetType === 'Recipe' && targetId && (
            <button disabled={busy} onClick={() => onAction(() => hideRecipe(targetId, `Report: ${report.reason}`))} style={dangerBtn}>
              Hide recipe
            </button>
          )}
          {report.targetType === 'Recipe' && targetId && (
            <button disabled={busy} onClick={() => onAction(() => restoreRecipe(targetId))} style={ghostBtn}>
              Restore
            </button>
          )}
          {report.targetType === 'Comment' && targetId && (
            <button disabled={busy} onClick={() => onAction(() => removeComment(targetId, `Report: ${report.reason}`))} style={dangerBtn}>
              Remove comment
            </button>
          )}
          {report.targetType === 'User' && targetId && (
            <>
              <button disabled={busy} onClick={() => onAction(() => suspendUser(targetId, 7, `Report: ${report.reason}`))} style={dangerBtn}>
                Suspend 7 days
              </button>
              <button disabled={busy} onClick={() => onAction(() => banUser(targetId, `Report: ${report.reason}`))} style={dangerBtn}>
                Ban
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button disabled={busy} onClick={() => onAction(() => resolveReport(report.id))} style={primarySmallBtn}>
            Resolve
          </button>
          <button disabled={busy} onClick={() => onAction(() => dismissReport(report.id))} style={ghostBtn}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

function CountTile({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div style={countTile}>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          marginTop: 4,
          color: accent ? 'var(--accent)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

const countsRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
  marginBottom: 16,
}

const countTile: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '12px 14px',
}

const scopeTab: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 11,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--muted)',
}

const scopeTabOn: CSSProperties = {
  ...scopeTab,
  border: '1px solid transparent',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

const reportCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '13px 14px',
}

const listCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '4px 14px',
}

const auditRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  flexWrap: 'wrap',
  fontSize: 12.5,
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
}

const mutedNote: CSSProperties = { fontSize: 13, color: 'var(--muted)', padding: '10px 0' }

const alertStyle: CSSProperties = {
  fontSize: 12.5,
  color: '#d9534f',
  fontWeight: 600,
  marginBottom: 10,
}

const linkBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  padding: 0,
}

const smallBtnBase: CSSProperties = {
  cursor: 'pointer',
  borderRadius: 10,
  padding: '7px 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
}

const primarySmallBtn: CSSProperties = {
  ...smallBtnBase,
  border: 'none',
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
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
