// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream W0-FE, Task 6) — the report triage queue, moved out of
// the old single-page AdminPage.tsx onto its own route. Reports now arrive
// wrapped (spec §5.5: reporter + target-author context) — `const r =
// item.report` below keeps every existing field access compiling and
// working. FE-4 (Task 18): the context line (reporter/targetAuthor display,
// the "View recipe" link) is added below, under the report body.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queryKeys } from '@/api/queryKeys'
import { Badge } from '@/components/ui/badge'
import { timeAgo } from '@/lib/time'
import type { ReportStatus } from '@/api/reports'
import {
  banUser,
  dismissReport,
  getAdminReports,
  hideRecipe,
  removeComment,
  resolveReport,
  restoreRecipe,
  suspendUser,
  type AdminReportListItem,
} from '@/api/admin'
import { alertStyle, linkBtn, mutedNote, scopeTab, scopeTabOn, useAdminMutation } from './adminShared'

const STATUSES: ReportStatus[] = ['Open', 'Resolved', 'Dismissed']

export default function AdminReportsTab() {
  const [status, setStatus] = useState<ReportStatus>('Open')
  const { mutate, isPending, error } = useAdminMutation()

  const reports = useInfiniteQuery({
    queryKey: queryKeys.admin.reports(status),
    queryFn: ({ pageParam }) => getAdminReports({ status, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const items = reports.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div>
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
          {items.map((item) => (
            <ReportCard key={item.report.id} item={item} busy={isPending} onAction={mutate} />
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
    </div>
  )
}

function ReportCard({
  item,
  busy,
  onAction,
}: {
  item: AdminReportListItem
  busy: boolean
  onAction: (fn: () => Promise<unknown>) => void
}) {
  const r = item.report
  const open = r.status === 'Open'
  const targetId = r.targetId
  const automated = r.source === 'Automated'

  return (
    <div style={reportCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge variant="outline">{r.reason}</Badge>
        {/* Stream X: an auto-flag sits in the same queue as a human report and is
            actioned identically — the badge only says where the signal came from,
            and the confidence says how much to trust it before reading further. */}
        {automated && (
          <Badge variant="outline">
            Auto{typeof r.confidence === 'number' ? ` · ${Math.round(r.confidence * 100)}%` : ''}
          </Badge>
        )}
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          {r.targetType} ·{' '}
          {automated ? 'flagged automatically' : `reported by ${r.reporter.username}`} ·{' '}
          {timeAgo(r.createdAt)}
        </span>
      </div>

      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 7, overflowWrap: 'anywhere' }}>
        {r.targetSummary}
      </div>
      {r.details && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, overflowWrap: 'anywhere' }}>
          “{r.details}”
        </div>
      )}

      {/* Task 18: triage context — who reported it, who they're reporting, and
          how many reports that target author already has against them. The target
          author is absent once the reported row itself is gone (removing a comment
          nulls the report's only target FK); the report stays triageable on its
          snapshot above, so this just drops the half it can no longer state. */}
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
        Reported by {item.reporter.username}
        {item.targetAuthor ? (
          <>
            {' · against '}
            {item.targetAuthor.username} ({item.targetAuthor.totalReportsAgainst} reports total)
          </>
        ) : (
          ' · target since removed'
        )}
        {r.targetType === 'Recipe' && targetId && (
          <>
            {' · '}
            <Link to={`/admin/recipes/${targetId}`} style={linkBtn}>
              View recipe
            </Link>
          </>
        )}
      </div>

      {!open && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
          {r.status} {r.resolvedByUsername ? `by ${r.resolvedByUsername}` : ''}
          {r.resolutionNote ? ` — ${r.resolutionNote}` : ''}
        </div>
      )}

      {open && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {/* Target action first — the thing the report is asking for. */}
          {r.targetType === 'Recipe' && targetId && (
            <button disabled={busy} onClick={() => onAction(() => hideRecipe(targetId, `Report: ${r.reason}`))} style={dangerBtn}>
              Hide recipe
            </button>
          )}
          {r.targetType === 'Recipe' && targetId && (
            <button disabled={busy} onClick={() => onAction(() => restoreRecipe(targetId))} style={ghostBtn}>
              Restore
            </button>
          )}
          {r.targetType === 'Comment' && targetId && (
            <button disabled={busy} onClick={() => onAction(() => removeComment(targetId, `Report: ${r.reason}`))} style={dangerBtn}>
              Remove comment
            </button>
          )}
          {r.targetType === 'User' && targetId && (
            <>
              <button disabled={busy} onClick={() => onAction(() => suspendUser(targetId, 7, `Report: ${r.reason}`))} style={dangerBtn}>
                Suspend 7 days
              </button>
              <button disabled={busy} onClick={() => onAction(() => banUser(targetId, `Report: ${r.reason}`))} style={dangerBtn}>
                Ban
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button disabled={busy} onClick={() => onAction(() => resolveReport(r.id))} style={primarySmallBtn}>
            Resolve
          </button>
          <button disabled={busy} onClick={() => onAction(() => dismissReport(r.id))} style={ghostBtn}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// ── Styles (ReportCard-only; not shared, so they stay local rather than in adminShared) ──

const reportCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '13px 14px',
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
