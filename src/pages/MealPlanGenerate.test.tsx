import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import MealPlanPage from './MealPlanPage'
import * as api from '@/api/mealPlans'

// MemoryRouter for the same reason as ShoppingListPage.test.tsx — the page links
// through to the shopping list once Task 8 lands.
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MealPlanPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('generate shopping list', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue({
      id: 'p1', weekStartDate: '2026-07-20T00:00:00Z', createdAt: '2026-07-19T00:00:00Z', entryCount: 1, totalMinutes: 30,
    })
    vi.spyOn(api, 'getMealPlan').mockResolvedValue({
      id: 'p1', weekStartDate: '2026-07-20T00:00:00Z', createdAt: '2026-07-19T00:00:00Z',
      entries: [{ id: 'e1', dayOfWeek: 'Monday', mealType: 'Dinner', recipe: { id: 'r1', title: 'Toast', imageUrl: null, totalTimeMinutes: 30 } }],
    })
  })

  it('warns that purchased ticks are lost before generating', async () => {
    const generate = vi.spyOn(api, 'generateShoppingList').mockResolvedValue([])

    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /shopping list/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /shopping list/i }))

    expect(await screen.findByText(/purchased/i)).toBeInTheDocument()
    expect(generate).not.toHaveBeenCalled()
  })

  it('generates only after the warning is confirmed', async () => {
    const generate = vi.spyOn(api, 'generateShoppingList').mockResolvedValue([])

    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /shopping list/i })).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /shopping list/i }))
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }))

    await waitFor(() => expect(generate).toHaveBeenCalledWith('p1'))
  })
})
