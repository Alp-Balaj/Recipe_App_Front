// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream W0-FE, Task 6; events pane by FE-3, Task 17) — the
// Events tab. An App events | Admin audit toggle: the audit pane is today's
// audit trail moved verbatim out of AdminPage.tsx (unchanged behavior, new
// home) — untouched here. The events pane is the keyset-paged app-event feed
// (spec §5.6): category chips (All/AI/Content/Account) drive a
// useInfiniteQuery, same "More X" pagination pattern as the reports queue,
// rows styled with the same auditRow the audit pane uses beside it.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getAdminAudit, getAdminEvents, type AppEventCategory, type AppEventType } from '@/api/admin'
import { timeAgo } from '@/lib/time'
import { auditRow, describeAction, linkBtn, listCard, mutedNote, scopeTab, scopeTabOn } from './adminShared'

type Pane = 'events' | 'audit'

export default function AdminEventsTab() {
  const [pane, setPane] = useState<Pane>('audit')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }} role="group" aria-label="Events scope">
        <button
          type="button"
          aria-pressed={pane === 'events'}
          onClick={() => setPane('events')}
          style={pane === 'events' ? scopeTabOn : scopeTab}
        >
          App events
        </button>
        <button
          type="button"
          aria-pressed={pane === 'audit'}
          onClick={() => setPane('audit')}
          style={pane === 'audit' ? scopeTabOn : scopeTab}
        >
          Admin audit
        </button>
      </div>

      {pane === 'events' ? <EventsPane /> : <AuditPane />}
    </div>
  )
}

// ── Events pane (Task 17) ───────────────────────────────────────────────

const CATEGORY_FILTERS: { label: string; value?: AppEventCategory }[] = [
  { label: 'All', value: undefined },
  { label: 'AI', value: 'Ai' },
  { label: 'Content', value: 'Content' },
  { label: 'Account', value: 'Account' },
]

// One arm per AppEventType member. `noImplicitReturns` is off, so a missing arm
// returns undefined and the row renders blank rather than failing the build —
// which is why the union in @/api/admin carries a note to update this too.
function describeEvent(type: AppEventType): string {
  switch (type) {
    case 'AiCallFailed': return 'AI call failed'
    case 'RecipeCreated': return 'created a recipe'
    case 'RecipeDeleted': return 'deleted a recipe'
    case 'CommentCreated': return 'commented'
    case 'ReportFiled': return 'filed a report'
    case 'UserRegistered': return 'registered'
    case 'UserLoginFailed': return 'failed to log in'
    // KAN-19 (account recovery).
    case 'EmailVerified': return 'verified their email'
    case 'PasswordReset': return 'reset their password'
    case 'MailSendFailed': return 'mail delivery failed'
  }
}

function EventsPane() {
  const [category, setCategory] = useState<AppEventCategory | undefined>(undefined)

  const events = useInfiniteQuery({
    queryKey: queryKeys.admin.events(category),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      getAdminEvents({ category, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  const items = events.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }} role="group" aria-label="Event category">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            aria-pressed={category === f.value}
            onClick={() => setCategory(f.value)}
            style={category === f.value ? scopeTabOn : scopeTab}
          >
            {f.label}
          </button>
        ))}
      </div>

      {events.isLoading ? (
        <div style={mutedNote}>Loading…</div>
      ) : events.isError ? (
        <div style={mutedNote}>
          Couldn't load events.{' '}
          <button onClick={() => events.refetch()} style={linkBtn}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div style={mutedNote}>Nothing logged yet.</div>
      ) : (
        <div style={listCard}>
          {items.map((entry) => (
            <div key={entry.id} style={auditRow}>
              <span style={eventCategoryChip}>{entry.category}</span>
              <span style={{ fontWeight: 700 }}>{entry.actorUsername ?? 'unknown'}</span>
              <span style={{ color: 'var(--muted)' }}>{describeEvent(entry.type)}</span>
              {entry.detail && <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>— {entry.detail}</span>}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5, flexShrink: 0 }}>
                {timeAgo(entry.createdAt)}
              </span>
            </div>
          ))}
          {events.hasNextPage && (
            <div style={{ padding: '8px 0' }}>
              <button
                onClick={() => events.fetchNextPage()}
                disabled={events.isFetchingNextPage}
                style={linkBtn}
              >
                {events.isFetchingNextPage ? 'Loading…' : 'More events'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const eventCategoryChip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--muted)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '1px 6px',
  flexShrink: 0,
}

function AuditPane() {
  const audit = useQuery({
    queryKey: queryKeys.admin.audit(),
    queryFn: () => getAdminAudit({ limit: 20 }),
  })

  if (audit.isLoading) {
    return <div style={mutedNote}>Loading…</div>
  }
  if ((audit.data?.items.length ?? 0) === 0) {
    return <div style={mutedNote}>No actions yet — the log starts with the first one.</div>
  }
  return (
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
  )
}
