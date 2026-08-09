// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream W0-FE, Task 6) — the tabbed admin section's layout.
// The role gate below moved here verbatim from the old single-page
// AdminPage.tsx: UX-only, since the backend's AdminOnly policy is the real
// boundary and every call from any tab still 403s for a non-admin. Below the
// gate sits the tab strip (Dashboard / Reports / Users / Events), then the
// active tab renders through <Outlet />.
// ─────────────────────────────────────────────────────────────────────────

import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import StateBlock from '@/components/ui/StateBlock'
import { pageStyle, scopeTab, scopeTabOn } from './adminShared'

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/events', label: 'Events' },
]

export default function AdminLayout() {
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

  return (
    <div className="scroll" style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Admin</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 14px' }}>
        Reports in, actions out — every action lands in the audit log.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }} role="group" aria-label="Admin section">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} style={({ isActive }) => (isActive ? scopeTabOn : scopeTab)}>
            {tab.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  )
}
