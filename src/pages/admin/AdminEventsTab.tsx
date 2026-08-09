// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream W0-FE, Task 6) — the Events tab. An App events | Admin
// audit toggle: the audit pane is today's audit trail moved verbatim out of
// AdminPage.tsx (unchanged behavior, new home); the events pane is a stub —
// FE-3 (Task 17) replaces it with the keyset-paged app-event feed, keeping
// this toggle and the audit pane untouched.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getAdminAudit } from '@/api/admin'
import { timeAgo } from '@/lib/time'
import { auditRow, describeAction, listCard, mutedNote, scopeTab, scopeTabOn } from './adminShared'

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

      {pane === 'events' ? <div style={mutedNote}>Events land in FE-3.</div> : <AuditPane />}
    </div>
  )
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
