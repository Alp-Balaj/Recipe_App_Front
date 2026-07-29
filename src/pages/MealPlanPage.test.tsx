import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderRoute } from '@/test/utils'
import * as api from '@/api/mealPlans'

// Session stubbing follows BrowsePage.test.tsx: renderRoute mounts the real
// route tree with a fake authenticated AuthContext, so the shell renders the
// routed page instead of the guest login gate.
function renderAt(path: string) {
  return renderRoute(path)
}

describe('meal-planning routes', () => {
  beforeEach(() => vi.restoreAllMocks())

  // /plan is the month calendar now; the 7×3 board moved to /plan/week/:start.
  it('/plan renders the month surface', async () => {
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [], nextCursor: null })

    renderAt('/plan')

    await waitFor(() =>
      expect(screen.getByText(/pick a day to plan its meals/i)).toBeInTheDocument(),
    )
  })

  it('/plan/week/:start renders the board for the week that segment names', async () => {
    const lookup = vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderAt('/plan/week/2026-07-29')

    await waitFor(() => expect(screen.getByRole('heading', { name: /meal plan/i })).toBeInTheDocument())
    // Wednesday 29 July 2026 resolves to the Monday of its week — the board can
    // finally show a week other than the current one.
    expect(lookup).toHaveBeenCalledWith('2026-07-27T00:00:00.000Z', expect.anything())
  })

  it('falls back to this week when the segment is malformed', async () => {
    const lookup = vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderAt('/plan/week/nonsense')

    await waitFor(() => expect(lookup).toHaveBeenCalled())
    expect(screen.getByRole('heading', { name: /meal plan/i })).toBeInTheDocument()
  })

  it('/shopping-list renders the shopping-list surface', async () => {
    vi.spyOn(api, 'getShoppingListPage').mockResolvedValue({ items: [], nextCursor: null })

    renderAt('/shopping-list')

    await waitFor(() => expect(screen.getByRole('heading', { name: /shopping list/i })).toBeInTheDocument())
  })

  it('offers to start a plan when that week has none', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderAt('/plan/week/2026-07-29')

    await waitFor(() => expect(screen.getByRole('button', { name: /start this week/i })).toBeInTheDocument())
  })
})
