// Admin Rework (stream FE-1, Task 15) — AdminDashboardTab. getAdminOverview is
// mocked directly (rather than through MSW) so the fixed payload's shape is
// exact and visible right here, next to the assertions it drives.
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderRoute, makeAuthValue, TEST_ADMIN } from '@/test/utils'
import type { AdminOverviewResponse } from '@/api/admin'

vi.mock('../../api/admin', () => ({
  getAdminOverview: vi.fn(),
}))

import { getAdminOverview } from '../../api/admin'

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

describe('AdminDashboardTab', () => {
  it('renders the banned-count subtitle, a lane row, and a top-consumer link', async () => {
    vi.mocked(getAdminOverview).mockResolvedValue(overview)

    renderRoute('/admin', { auth: makeAuthValue({ user: TEST_ADMIN }) })

    expect(await screen.findByText(/3 banned/)).toBeTruthy()
    expect(screen.getByText('RecipeGen')).toBeTruthy()

    const link = await screen.findByRole('link', { name: 'chef_ana' })
    expect(link.getAttribute('href')).toBe('/admin/users/user-1')
  })

  it('shows the empty state when nobody used AI today', async () => {
    vi.mocked(getAdminOverview).mockResolvedValue({
      ...overview,
      aiToday: { ...overview.aiToday, topUsers: [] },
    })

    renderRoute('/admin', { auth: makeAuthValue({ user: TEST_ADMIN }) })

    expect(await screen.findByText('No AI spend today.')).toBeTruthy()
  })
})
