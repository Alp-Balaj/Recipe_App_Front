// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream FE-2, Task 16) — the Users tab: search + status/sort
// filters over the full roster, offset-paged (§5.2). Every row links to
// AdminUserDetailPage, which is where moderation and role actions live —
// this tab is a browser, not an actions surface.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { queryKeys } from '@/api/queryKeys'
import {
  getAdminUsers,
  type AdminUserListItem,
  type AdminUserSort,
  type AdminUserStatusFilter,
} from '@/api/admin'
import { auditRow, linkBtn, listCard, mutedNote, scopeTab, scopeTabOn } from './adminShared'

/** Matches BrowsePage's search debounce — the app's other type-ahead. */
const SEARCH_DEBOUNCE_MS = 300

const STATUS_FILTERS: { value: AdminUserStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'banned', label: 'Banned' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'admins', label: 'Admins' },
]

const SORTS: { value: AdminUserSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'tokens', label: 'Tokens' },
]

export default function AdminUsersTab() {
  const [search, setSearch] = useState('')
  // `debouncedSearch` is what reaches the query key — typing does not fire a
  // request per keystroke (same two-state shape as BrowsePage's search).
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<AdminUserStatusFilter>('all')
  const [sort, setSort] = useState<AdminUserSort>('newest')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  // A filter change can invalidate the current page number — start back at 1
  // rather than stranding the viewer on a page that may no longer exist.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, sort])

  const params = { search: debouncedSearch || undefined, status, sort, page }
  const users = useQuery({
    queryKey: queryKeys.admin.users(params),
    queryFn: () => getAdminUsers(params),
  })

  const data = users.data

  return (
    <div>
      <input
        type="search"
        aria-label="Search users"
        placeholder="Search by username or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchInput}
      />

      <div style={filterRow} role="group" aria-label="User status">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => setStatus(f.value)}
            style={status === f.value ? scopeTabOn : scopeTab}
          >
            {f.label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={sort === s.value}
            onClick={() => setSort(s.value)}
            style={sort === s.value ? scopeTabOn : scopeTab}
          >
            {s.label}
          </button>
        ))}
      </div>

      {users.isLoading ? (
        <div style={mutedNote}>Loading users…</div>
      ) : users.isError ? (
        <div style={mutedNote}>
          Couldn't load users.{' '}
          <button onClick={() => users.refetch()} style={linkBtn}>
            Try again
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div style={mutedNote}>No users match.</div>
      ) : (
        <>
          <div style={listCard}>
            {data.items.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </div>
          <div style={pagerRow}>
            <button disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)} style={linkBtn}>
              Prev
            </button>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Page {data.page} of {Math.max(1, data.totalPages)}
            </span>
            <button
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
              style={linkBtn}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function UserRow({ user }: { user: AdminUserListItem }) {
  const suspendedActive =
    !!user.suspendedUntilUtc && new Date(user.suspendedUntilUtc).getTime() > Date.now()
  const state = user.isBanned ? 'Banned' : suspendedActive ? `Suspended · ${timeUntil(user.suspendedUntilUtc!)} left` : null

  return (
    <Link to={`/admin/users/${user.id}`} style={userRowLink}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.username}
          </span>
          <Badge variant={user.role === 'Admin' ? 'default' : 'outline'}>{user.role}</Badge>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.email}
        </div>
        {state && <div style={{ fontSize: 11.5, color: '#d9534f', marginTop: 2, fontWeight: 700 }}>{state}</div>}
      </div>
      <div style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', textAlign: 'right', flexShrink: 0 }}>
        {user.allTimeTokens.toLocaleString()}
        <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>tokens</div>
      </div>
    </Link>
  )
}

/** "3d" / "5h" / "12m" — timeAgo's bucketing, run against a FUTURE timestamp. */
function timeUntil(iso: string): string {
  const secs = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000))
  if (secs < 60) return '<1m'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

// ── Styles (tab-local; not shared, so they stay here rather than in adminShared) ──

const searchInput: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 11,
  padding: '9px 12px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--text)',
}

const filterRow: CSSProperties = { display: 'flex', gap: 6, margin: '10px 0 12px', flexWrap: 'wrap', alignItems: 'center' }

const pagerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 12,
}

const userRowLink: CSSProperties = {
  ...auditRow,
  textDecoration: 'none',
  color: 'inherit',
  justifyContent: 'space-between',
  cursor: 'pointer',
}
