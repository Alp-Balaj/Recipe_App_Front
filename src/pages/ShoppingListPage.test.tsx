import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ShoppingListPage from './ShoppingListPage'
import * as api from '@/api/mealPlans'

// MemoryRouter even though the page is rendered directly: these surfaces link to
// each other (plan <-> list), and a bare render would throw the moment a <Link>
// appears. Cheap insurance, and it keeps the test stable as the page grows.
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ShoppingListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ShoppingListPage', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders the caller items', async () => {
    vi.spyOn(api, 'getShoppingListPage').mockResolvedValue({
      items: [
        { id: 'i1', ingredient: 'Lentils', quantity: '200 g', isPurchased: false, createdAt: '2026-07-20T00:00:00Z', mealPlanId: 'p1' },
        { id: 'i2', ingredient: 'Onion', quantity: '1', isPurchased: true, createdAt: '2026-07-20T00:00:00Z', mealPlanId: null },
      ],
      nextCursor: null,
    })

    renderPage()

    await waitFor(() => expect(screen.getByText('Lentils')).toBeInTheDocument())
    expect(screen.getByText('200 g')).toBeInTheDocument()
    expect(screen.getByText('Onion')).toBeInTheDocument()
  })

  it('ticking an item PATCHes an explicit true', async () => {
    vi.spyOn(api, 'getShoppingListPage').mockResolvedValue({
      items: [{ id: 'i1', ingredient: 'Lentils', quantity: '200 g', isPurchased: false, createdAt: '2026-07-20T00:00:00Z', mealPlanId: null }],
      nextCursor: null,
    })
    const patch = vi.spyOn(api, 'setShoppingListItemPurchased').mockResolvedValue(undefined)

    renderPage()
    await waitFor(() => expect(screen.getByText('Lentils')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('checkbox', { name: /lentils/i }))

    expect(patch).toHaveBeenCalledWith('i1', true)
  })

  it('shows an empty state when the list is empty', async () => {
    vi.spyOn(api, 'getShoppingListPage').mockResolvedValue({ items: [], nextCursor: null })

    renderPage()

    await waitFor(() => expect(screen.getByText(/nothing on your list/i)).toBeInTheDocument())
  })
})
