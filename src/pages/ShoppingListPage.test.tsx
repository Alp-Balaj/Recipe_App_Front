import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { weekStartOf } from '@/api/mealPlans'
import { queryKeys } from '@/api/queryKeys'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'

const week = {
  weekStartDate: '2026-07-27T00:00:00Z',
  purchasedCount: 1,
  totalCount: 3,
  groups: [
    {
      key: 'flour', displayName: 'Flour',
      parts: [{ quantity: '2 cups', dishTitle: 'Pasta' }, { quantity: '500 g', dishTitle: 'Bread' }],
      dishes: ['Pasta', 'Bread'], isPurchased: false, origin: 'Derived', manualItemId: null,
    },
    {
      key: 'carrot', displayName: 'Carrot',
      parts: [{ quantity: '3', dishTitle: 'Soup' }],
      dishes: ['Soup'], isPurchased: true, origin: 'Derived', manualItemId: null,
    },
    {
      key: 'manual:11111111-1111-1111-1111-111111111111', displayName: 'Bin bags',
      parts: [{ quantity: '1 roll', dishTitle: 'Added by you' }],
      dishes: [], isPurchased: false, origin: 'Manual',
      manualItemId: '11111111-1111-1111-1111-111111111111',
    },
  ],
}

const listHandler = (orphans: string[] = []) =>
  http.get('/api/shopping-list', () =>
    HttpResponse.json({ weeks: [week], orphanedPurchasedNames: orphans }))

describe('ShoppingListPage', () => {
  it('groups an ingredient once and names the dishes it serves', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    expect(await screen.findByText('Flour')).toBeInTheDocument()
    expect(screen.getAllByText('Flour')).toHaveLength(1)
    expect(screen.getByText(/Pasta/)).toBeInTheDocument()
    expect(screen.getByText(/Bread/)).toBeInTheDocument()
  })

  it('shows a progress read for the visible scope', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    expect(await screen.findByText('1 of 3')).toBeInTheDocument()
  })

  it('hides bought items only when asked, and keeps them reachable', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    expect(await screen.findByText('Carrot')).toBeInTheDocument()   // in place, not sunk
    await userEvent.click(screen.getByRole('button', { name: /hide bought \(1\)/i }))
    expect(screen.queryByText('Carrot')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /show bought \(1\)/i }))
    expect(screen.getByText('Carrot')).toBeInTheDocument()
  })

  it('suppresses a derived group but deletes a manual one', async () => {
    const marks: unknown[] = []
    let deleted: string | null = null
    server.use(
      listHandler(),
      http.put('/api/shopping-list/marks', async ({ request }) => {
        marks.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('/api/shopping-list/:id', ({ params }) => {
        deleted = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/shopping-list')

    await userEvent.click(await screen.findByRole('button', { name: /remove flour/i }))
    await waitFor(() => expect(marks).toHaveLength(1))
    expect(marks[0]).toMatchObject({ key: 'flour', isSuppressed: true })

    await userEvent.click(screen.getByRole('button', { name: /remove bin bags/i }))
    await waitFor(() => expect(deleted).toBe('11111111-1111-1111-1111-111111111111'))
    // The manual row is deleted for REAL, never suppressed: isSuppressed:true on a
    // `manual:` key is a 400 server-side. So no second mark may have been sent.
    expect(marks).toHaveLength(1)
  })

  /**
   * Not one of the brief's cases, carried over from the retired page's own tick
   * test: this is the page's primary gesture, and the mark is an explicit full set
   * of BOTH flags — a tick that sent isSuppressed:true would delete the row.
   */
  it('ticks in place with an explicit unsuppressed mark', async () => {
    const marks: unknown[] = []
    server.use(
      listHandler(),
      http.put('/api/shopping-list/marks', async ({ request }) => {
        marks.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/shopping-list')

    const before = screen.queryAllByRole('checkbox').length
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flour' }))

    await waitFor(() => expect(marks).toHaveLength(1))
    expect(marks[0]).toEqual({
      weekStartDate: week.weekStartDate,
      key: 'flour',
      isPurchased: true,
      isSuppressed: false,
    })
    // Dimmed, not moved: still the first row, still on screen, nothing rearranged.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(Math.max(before, 3))
    expect(screen.getAllByRole('checkbox')[0]).toHaveAccessibleName('Flour')
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
  })

  it('tells you when something you bought left your plan', async () => {
    server.use(listHandler(['Saffron']))
    renderRoute('/shopping-list')

    expect(await screen.findByText(/no longer in your plan/i)).toBeInTheDocument()
    expect(screen.getByText(/Saffron/)).toBeInTheDocument()
  })

  it('renders the cache with an offline banner when the fetch fails', async () => {
    // Requires the `client` option added to renderRoute — that function returns the
    // ROUTER, not a query client, so there is otherwise no handle to seed or refetch
    // the cache from a test. The key uses weekStartOf(new Date()) rather than a
    // literal Monday so this case does not expire at the end of the week.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(queryKeys.shopping.week(weekStartOf(new Date()), 'Week'), {
      weeks: [week],
      orphanedPurchasedNames: [],
    })
    server.use(http.get('/api/shopping-list', () => HttpResponse.error()))

    renderRoute('/shopping-list', { client })

    // The list stays readable — you are standing in a shop — and says why it may be stale.
    expect(await screen.findByText('Flour')).toBeInTheDocument()
    expect(await screen.findByText(/offline/i)).toBeInTheDocument()
  })

  it('shows an empty state for a week with nothing planned', async () => {
    server.use(http.get('/api/shopping-list', () =>
      HttpResponse.json({
        weeks: [{ weekStartDate: '2026-07-27T00:00:00Z', groups: [], purchasedCount: 0, totalCount: 0 }],
        orphanedPurchasedNames: [],
      })))
    renderRoute('/shopping-list')

    expect(await screen.findByText(/nothing on your list/i)).toBeInTheDocument()
  })
})
