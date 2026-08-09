// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream FE-1, Task 15) — AdminDashboardTab.
//
// Mocking approach: MSW, matching every other test in this codebase (no test
// anywhere in src/ uses vi.mock for API modules). The plan's text suggested
// vi.mock('../../api/admin'), but a module-factory mock replaces the WHOLE
// module with the one function named here — every other admin.ts export in the
// rendered tree silently becomes undefined, so the test only keeps passing as
// long as nothing else on the route imports from admin.ts. Going through the
// network layer avoids that trap and keeps the admin folder consistent.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, makeAuthValue, TEST_ADMIN } from '@/test/utils'
import type { AdminOverviewResponse } from '@/api/admin'

const overview: AdminOverviewResponse = {
  users: { total: 120, banned: 3, suspended: 2, admins: 4 },
  recipes: { total: 400, hidden: 5 },
  comments: { total: 900 },
  reports: { open: 6, resolved: 40, dismissed: 10 },
  aiToday: {
    calls: 250,
    tokens: 12000,
    byLane: [
      { lane: 'RecipeGen', calls: 100, tokens: 5000 },
      { lane: 'Chat', calls: 80, tokens: 4000 },
      { lane: 'FoodScan', calls: 0, tokens: 0 },
    ],
    topUsers: [
      { userId: 'user-1', username: 'chef_ana', tokens: 3000 },
      { userId: 'user-2', username: 'baker_bob', tokens: 2000 },
    ],
  },
}

function serveOverview(payload: AdminOverviewResponse) {
  server.use(http.get('*/admin/overview', () => HttpResponse.json(payload)))
}

describe('AdminDashboardTab', () => {
  it('renders the banned-count subtitle, a lane row, and a top-consumer link', async () => {
    serveOverview(overview)

    renderRoute('/admin', { auth: makeAuthValue({ user: TEST_ADMIN }) })

    expect(await screen.findByText(/3 banned/)).toBeTruthy()
    expect(screen.getByText('RecipeGen')).toBeTruthy()

    const link = await screen.findByRole('link', { name: 'chef_ana' })
    expect(link.getAttribute('href')).toBe('/admin/users/user-1')
  })

  it('shows the empty state when nobody used AI today', async () => {
    serveOverview({ ...overview, aiToday: { ...overview.aiToday, topUsers: [] } })

    renderRoute('/admin', { auth: makeAuthValue({ user: TEST_ADMIN }) })

    expect(await screen.findByText('No AI spend today.')).toBeTruthy()
  })
})
