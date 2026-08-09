// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream FE-1, Task 15) — the admin landing tab. One overview
// call (GET /admin/overview) drives everything on this page: a counts row,
// an "AI today" card (headline + per-lane table), and a top-consumers list.
// Loading/error states follow the same mutedNote + retry idiom as the
// reports queue (AdminReportsTab).
// ─────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { queryKeys } from '@/api/queryKeys'
import { getAdminOverview } from '@/api/admin'
import { CountTile, countsRow, linkBtn, listCard, mutedNote } from './adminShared'

export default function AdminDashboardTab() {
  const overview = useQuery({
    queryKey: queryKeys.admin.overview(),
    queryFn: getAdminOverview,
  })

  if (overview.isLoading) {
    return <div style={mutedNote}>Loading overview…</div>
  }

  if (overview.isError || !overview.data) {
    return (
      <div style={mutedNote}>
        Couldn't load the overview.{' '}
        <button onClick={() => overview.refetch()} style={linkBtn}>
          Try again
        </button>
      </div>
    )
  }

  const { users, recipes, comments, reports, aiToday } = overview.data
  const topUsers = aiToday.topUsers.slice(0, 5)

  return (
    <div>
      <div style={countsRow}>
        <CountTile
          label="Users"
          value={users.total}
          sub={`${users.banned} banned · ${users.suspended} suspended · ${users.admins} admins`}
        />
        <CountTile label="Live recipes" value={recipes.total} sub={`${recipes.hidden} hidden`} />
        <CountTile label="Comments" value={comments.total} />
        <CountTile
          label="Open reports"
          value={reports.open}
          accent
          sub={`${reports.resolved} resolved · ${reports.dismissed} dismissed`}
        />
      </div>

      <div style={{ ...listCard, padding: '14px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>AI today</div>
        <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
          {aiToday.calls} calls / {aiToday.tokens} tokens
        </div>

        <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ fontWeight: 700, padding: '4px 0' }}>Lane</th>
              <th style={{ fontWeight: 700, padding: '4px 0', textAlign: 'right' }}>Calls</th>
              <th style={{ fontWeight: 700, padding: '4px 0', textAlign: 'right' }}>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {aiToday.byLane.map((lane) => {
              const zero = lane.calls === 0 && lane.tokens === 0
              return (
                <tr key={lane.lane} style={{ borderTop: '1px solid var(--border)', opacity: zero ? 0.5 : 1 }}>
                  <td style={{ padding: '5px 0' }}>{lane.lane}</td>
                  <td style={{ padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{lane.calls}</td>
                  <td style={{ padding: '5px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{lane.tokens}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ ...listCard, padding: '14px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>Top consumers today</div>
        {topUsers.length === 0 ? (
          <div style={mutedNote}>No AI spend today.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {topUsers.map((u) => (
              <div
                key={u.userId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 12.5,
                }}
              >
                <Link to={`/admin/users/${u.userId}`} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
                  {u.username}
                </Link>
                <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{u.tokens} tokens</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
