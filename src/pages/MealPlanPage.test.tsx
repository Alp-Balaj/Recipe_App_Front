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

  it('/plan renders the plan surface', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderAt('/plan')

    await waitFor(() => expect(screen.getByRole('heading', { name: /meal plan/i })).toBeInTheDocument())
  })

  it('/shopping-list renders the shopping-list surface', async () => {
    vi.spyOn(api, 'getShoppingListPage').mockResolvedValue({ items: [], nextCursor: null })

    renderAt('/shopping-list')

    await waitFor(() => expect(screen.getByRole('heading', { name: /shopping list/i })).toBeInTheDocument())
  })

  it('offers to start a plan when the week has none', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderAt('/plan')

    await waitFor(() => expect(screen.getByRole('button', { name: /start this week/i })).toBeInTheDocument())
  })
})
