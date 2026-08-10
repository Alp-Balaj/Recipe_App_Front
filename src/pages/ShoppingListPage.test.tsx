import { afterEach, describe, expect, it, vi } from 'vitest'
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
      key: 'flour', displayName: 'Flour', aisle: 'Pantry',
      // Parts arrive in (date, meal) order, so Pasta — the Monday dish — OWNS the
      // row and Bread is named as the other dish that wants it.
      parts: [
        { quantity: '2 cups', dishTitle: 'Pasta', date: '2026-07-27T00:00:00Z', meal: 'Dinner' },
        { quantity: '500 g', dishTitle: 'Bread', date: '2026-07-28T00:00:00Z', meal: 'Dinner' },
      ],
      dishes: ['Pasta', 'Bread'], isPurchased: false, origin: 'Derived', manualItemId: null,
      // Two totals: 2 cups is volume and 500 g is mass, and the two cannot be
      // collapsed without flour's density (slice G3). The UI must render both.
      totals: [
        { quantity: 500, unit: 'Gram', display: '500 g' },
        { quantity: 480, unit: 'Millilitre', display: '480 ml' },
      ],
    },
    {
      key: 'carrot', displayName: 'Carrot', aisle: 'Produce',
      parts: [{ quantity: '3', dishTitle: 'Soup', date: '2026-07-29T00:00:00Z', meal: 'Lunch' }],
      dishes: ['Soup'], isPurchased: true, origin: 'Derived', manualItemId: null,
      totals: [{ quantity: 3, unit: 'Piece', display: '3 pcs' }],
    },
    {
      key: 'manual:11111111-1111-1111-1111-111111111111', displayName: 'Bin bags', aisle: 'Other',
      parts: [{ quantity: '1 roll', dishTitle: 'Added by you', date: null, meal: null }],
      dishes: [], isPurchased: false, origin: 'Manual',
      manualItemId: '11111111-1111-1111-1111-111111111111',
      // Always empty for a manual row — "1 roll" is a note to self, not a
      // measurement, so there is nothing to add up.
      totals: [],
    },
  ],
}

/**
 * A second, OLDER week, returned only under scope 'All'. Its existence is the
 * whole point of the scope: a week you never finished shopping for still owes you
 * something, and its marks live under its OWN weekStartDate.
 */
const olderWeek = {
  weekStartDate: '2026-07-20T00:00:00Z',
  purchasedCount: 0,
  totalCount: 1,
  groups: [
    {
      key: 'saffron', displayName: 'Saffron', aisle: 'Spices & herbs',
      parts: [{ quantity: '1 g', dishTitle: 'Paella', date: '2026-07-24T00:00:00Z', meal: 'Dinner' }],
      dishes: ['Paella'], isPurchased: false, origin: 'Derived', manualItemId: null,
      totals: [{ quantity: 1, unit: 'Gram', display: '1 g' }],
    },
  ],
}

const listHandler = (orphans: string[] = []) =>
  http.get('/api/shopping-list', () =>
    HttpResponse.json({ weeks: [week], orphanedPurchasedNames: orphans }))

/** A week with nothing on it — used by the switcher tests, which care about the
 * requested weekStart, not the rendered rows. */
const emptyWeek = {
  weekStartDate: '2026-07-27T00:00:00Z',
  groups: [],
  purchasedCount: 0,
  totalCount: 0,
}

/** Answers per requested scope, recording each request so the query can be asserted. */
const scopedHandler = (seen: URL[]) =>
  http.get('/api/shopping-list', ({ request }) => {
    const url = new URL(request.url)
    seen.push(url)
    return HttpResponse.json(
      url.searchParams.get('scope') === 'All'
        ? { weeks: [week, olderWeek], orphanedPurchasedNames: [] }
        : { weeks: [week], orphanedPurchasedNames: [] },
    )
  })

/** A write that fails, slowly enough that the optimistic window is observable. */
const failsAfter = (ms = 50) =>
  async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    return new HttpResponse(null, { status: 500 })
  }

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

    const read = await screen.findByText('1 of 3')
    expect(read).toBeInTheDocument()
    // An aria-label here would REPLACE the number for a screen reader, costing
    // them the entire content. The context comes from a visually-hidden prefix,
    // so the announced name is "Bought 1 of 3" and the number survives.
    expect(read).not.toHaveAttribute('aria-label')
    expect(screen.getByText('Bought')).toBeInTheDocument()
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

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flour' }))

    await waitFor(() => expect(marks).toHaveLength(1))
    expect(marks[0]).toEqual({
      weekStartDate: week.weekStartDate,
      key: 'flour',
      isPurchased: true,
      isSuppressed: false,
    })
    // Dimmed, not moved: all three rows still on screen, Flour still the first.
    // Filtered because the aisle headings are checkboxes too now — that is how a
    // whole section is selected, and how multi-select starts without a long-press.
    const rows = screen
      .getAllByRole('checkbox')
      .filter((box) => !box.getAttribute('aria-label')?.startsWith('Select all'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAccessibleName('Flour')
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

  // The shop redesign replaces the list wholesale once nothing is left to tick:
  // aisles as a receipt, then the next thing to cook. Before it, hiding the last
  // bought row left the list area simply blank, which read as a broken page.
  it('shows the finished screen rather than going blank when everything is bought', async () => {
    const allBought = {
      weekStartDate: week.weekStartDate,
      purchasedCount: 1,
      totalCount: 1,
      groups: [week.groups[1]], // Carrot, already ticked
    }
    server.use(http.get('/api/shopping-list', () =>
      HttpResponse.json({ weeks: [allBought], orphanedPurchasedNames: [] })))
    renderRoute('/shopping-list')

    expect(await screen.findByText(/everything's ticked/i)).toBeInTheDocument()
    // The receipt names the aisle it all came out of, and how much it held.
    expect(screen.getByText('Produce')).toBeInTheDocument()
  })
})

/**
 * The shop redesign (direction 1c). The list is organised by AISLE, every row
 * says which dish and day it serves, and a whole section can be taken in one
 * click — which is what multi-select is for on a surface with no long-press.
 */
describe('ShoppingListPage — aisles, provenance and multi-select', () => {
  it('heads the list by aisle, in the order the server shelved them', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    await screen.findByText('Flour')
    // Walk order comes off the wire — Pantry before Produce here because that is
    // the order the groups arrived in. The page must not re-sort alphabetically.
    const aisles = screen
      .getAllByRole('checkbox')
      .map((box) => box.getAttribute('aria-label'))
      .filter((label): label is string => !!label?.startsWith('Select all in '))
    expect(aisles).toEqual(['Select all in Pantry', 'Select all in Produce', 'Select all in Other'])
    // And the heading states what the aisle still OWES, not what it holds:
    // Produce's one row is already ticked, so it reads 0 of 1 rather than 1 of 1.
    expect(screen.getByText('0 OF 1 LEFT')).toBeInTheDocument()
    expect(screen.getAllByText('1 OF 1 LEFT')).toHaveLength(2)
  })

  it('names the dish and day a row serves, and the other dish that shares it', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    // Flour is wanted by Monday's Pasta and Tuesday's Bread. It is bought ONCE,
    // under Pasta, and Bread is named on the same row rather than given its own.
    expect(await screen.findByText('Pasta · Mon, + Bread')).toBeInTheDocument()
    expect(screen.getAllByText('Flour')).toHaveLength(1)
    // A manual row serves no dish, so it carries no provenance line at all.
    expect(screen.queryByText(/Added by you/)).not.toBeInTheDocument()
  })

  it('re-groups the same rows by dish without duplicating a shared one', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    await screen.findByText('Flour')
    await userEvent.click(screen.getByRole('button', { name: 'By dish' }))

    expect(screen.getByRole('checkbox', { name: 'Select all in Pasta' })).toBeInTheDocument()
    // Bread wants flour too, but flour is Pasta's — "by dish" regroups the list,
    // it does not expand it into a per-dish list that says to buy flour twice.
    expect(screen.queryByRole('checkbox', { name: 'Select all in Bread' })).not.toBeInTheDocument()
    expect(screen.getAllByText('Flour')).toHaveLength(1)
  })

  it('takes a whole aisle in one click and ticks it in one action', async () => {
    const marks: { key: string; isPurchased: boolean }[] = []
    server.use(
      listHandler(),
      http.put('/api/shopping-list/marks', async ({ request }) => {
        marks.push((await request.json()) as { key: string; isPurchased: boolean })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/shopping-list')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all in Pantry' }))

    // The bar names what it has hold of before you act on it.
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByText(/Whole aisle — Pantry/)).toBeInTheDocument()
    // In selection mode the row checkbox means membership, and says so.
    expect(screen.getByRole('checkbox', { name: 'Select Flour' })).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: 'Tick 1' }))

    await waitFor(() => expect(marks).toHaveLength(1))
    expect(marks[0]).toMatchObject({ key: 'flour', isPurchased: true, isSuppressed: false })
    // The selection is spent, and the bar goes with it.
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
  })

  it('lets go of the selection without touching anything', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Select all in Produce' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument()
    // Back to meaning "bought" — and Carrot was already ticked.
    expect(screen.getByRole('checkbox', { name: 'Carrot' })).toBeChecked()
  })

  it('keeps the scanner on the list itself, not behind a finish screen', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    const scan = await screen.findByRole('link', { name: /scan receipt/i })
    expect(scan).toHaveAttribute('href', '/scan?mode=receipt')
  })
})

/**
 * scope 'All' is a genuinely different projection — a different request, several
 * weeks on one page, and marks that must land on the week the ROW belongs to
 * rather than the week the page is scoped to. That last one is the failure mode
 * worth the most: it is invisible under scope 'Week' (where there is only ever
 * one week to get wrong) and it silently marks the wrong week under 'All'.
 */
describe('ShoppingListPage — scope All', () => {
  it('asks for every week, with no weekStart at all', async () => {
    const seen: URL[] = []
    server.use(scopedHandler(seen))
    renderRoute('/shopping-list')

    await screen.findByText('Flour')
    expect(seen).toHaveLength(1)
    expect(seen[0].searchParams.get('scope')).toBe('Week')
    expect(seen[0].searchParams.get('weekStart')).toBe(weekStartOf(new Date()))

    await userEvent.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => expect(seen).toHaveLength(2))
    expect(seen[1].searchParams.get('scope')).toBe('All')
    // Not an empty string, not the current Monday — absent. scope=All ignores it
    // server-side, and sending one would only invite a disagreement.
    expect(seen[1].searchParams.has('weekStart')).toBe(false)
  })

  it('heads each week separately, and heads nothing when there is only one', async () => {
    server.use(scopedHandler([]))
    renderRoute('/shopping-list')

    await screen.findByText('Flour')
    // One week under scope 'Week': the scope control already said which.
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(await screen.findByText('Saffron')).toBeInTheDocument()

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings).toHaveLength(2)
    // Current week first, then descending — each carrying its own dates and count.
    expect(headings[0]).toHaveTextContent('27')
    expect(headings[0]).not.toHaveTextContent('20')
    expect(headings[1]).toHaveTextContent('20')
    expect(headings[0]).toHaveTextContent('1 of 3')
    expect(headings[1]).toHaveTextContent('0 of 1')
  })

  it("marks a row in the second week with THAT week's date, not the scoped one", async () => {
    const marks: { weekStartDate: string; key: string }[] = []
    server.use(
      scopedHandler([]),
      http.put('/api/shopping-list/marks', async ({ request }) => {
        marks.push((await request.json()) as { weekStartDate: string; key: string })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/shopping-list')

    await screen.findByText('Flour')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await screen.findByText('Saffron')

    await userEvent.click(screen.getByRole('checkbox', { name: 'Saffron' }))

    await waitFor(() => expect(marks).toHaveLength(1))
    expect(marks[0]).toMatchObject({ key: 'saffron', weekStartDate: olderWeek.weekStartDate })
    // The two ways this goes wrong: the first week on the page, or "this week".
    expect(marks[0].weekStartDate).not.toBe(week.weekStartDate)
    expect(marks[0].weekStartDate).not.toBe(weekStartOf(new Date()))

    // And the optimistic patch landed on the same week: the older week's count
    // moved, the current week's did not.
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings[0]).toHaveTextContent('1 of 3')
    expect(headings[1]).toHaveTextContent('1 of 1')
  })
})

describe('ShoppingListPage — the week it asks for', () => {
  afterEach(() => vi.useRealTimers())

  it('follows the clock over a week boundary instead of pinning it at mount', async () => {
    const seen: URL[] = []
    server.use(scopedHandler(seen))
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z')) // a Wednesday
    renderRoute('/shopping-list')

    await screen.findByText('Flour')
    expect(seen[0].searchParams.get('weekStart')).toBe('2026-07-27T00:00:00.000Z')

    // The phone was left on the shopping list and the week turned over.
    vi.setSystemTime(new Date('2026-08-03T00:30:00.000Z')) // the next Monday
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))

    // A week pinned at mount would re-use the cached 2026-07-27 key and ask for
    // nothing — so the last request would still be the 'All' one.
    await waitFor(() =>
      expect(seen.at(-1)!.searchParams.get('weekStart')).toBe('2026-08-03T00:00:00.000Z'),
    )
  })
})

describe('ShoppingListPage — a tick reaches the other scope', () => {
  it('leaves the sibling scope stale without refetching the list in your hand', async () => {
    const seen: URL[] = []
    server.use(
      scopedHandler(seen),
      http.put('/api/shopping-list/marks', () => new HttpResponse(null, { status: 204 })),
    )
    // PRODUCTION's staleTime (src/main.tsx), not the test default of 0. It is the
    // whole reason this bug existed: with staleTime 0 every scope switch refetches
    // and the staleness can never be observed, so a test on the default client
    // would pass whether or not the sibling is invalidated.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
    })
    renderRoute('/shopping-list', { client })

    // Visit both scopes so both projections are cached, then come back.
    await screen.findByText('Flour')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await screen.findByText('Saffron')
    await userEvent.click(screen.getByRole('button', { name: 'This week' }))
    await screen.findByText('Flour')
    // Both are cached and fresh — coming back asked for nothing.
    expect(seen).toHaveLength(2)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Flour' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Flour' })).toBeChecked())

    // The list being read is NOT refetched — that is the point of the asymmetry.
    expect(seen).toHaveLength(2)

    // But 'All' was marked stale, so switching to it fetches rather than showing
    // the row unticked for the rest of the staleTime window.
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(seen).toHaveLength(3))
    expect(seen[2].searchParams.get('scope')).toBe('All')
  })
})

/**
 * Rollback. A silently broken onError is the worst failure this surface has: the
 * cache keeps an optimistic edit the server rejected, so you walk out of the shop
 * having "ticked" something that never persisted. Each case therefore also pins
 * the GET count at 1 — the reverted state must come from the snapshot and NOT
 * from a refetch, which would make these tests pass against the bug.
 */
describe('ShoppingListPage — failed writes roll back', () => {
  const countingList = (gets: unknown[]) =>
    http.get('/api/shopping-list', () => {
      gets.push(1)
      return HttpResponse.json({ weeks: [week], orphanedPurchasedNames: [] })
    })

  it('puts a tick back when the mark write fails', async () => {
    const gets: unknown[] = []
    server.use(countingList(gets), http.put('/api/shopping-list/marks', failsAfter()))
    renderRoute('/shopping-list')

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Flour' }))

    // Optimistic first — the tick and the progress read both move immediately.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Flour' })).toBeChecked())
    expect(screen.getByText('2 of 3')).toBeInTheDocument()

    // Then the write fails and the snapshot comes back.
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Flour' })).not.toBeChecked())
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(gets).toHaveLength(1)
  })

  it('puts a suppressed row back when the mark write fails', async () => {
    const gets: unknown[] = []
    server.use(countingList(gets), http.put('/api/shopping-list/marks', failsAfter()))
    renderRoute('/shopping-list')

    await userEvent.click(await screen.findByRole('button', { name: /remove flour/i }))

    await waitFor(() => expect(screen.queryByText('Flour')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Flour')).toBeInTheDocument())
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(gets).toHaveLength(1)
  })

  it('puts a manual row back when the delete fails', async () => {
    const gets: unknown[] = []
    server.use(countingList(gets), http.delete('/api/shopping-list/:id', failsAfter()))
    renderRoute('/shopping-list')

    await userEvent.click(await screen.findByRole('button', { name: /remove bin bags/i }))

    await waitFor(() => expect(screen.queryByText('Bin bags')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Bin bags')).toBeInTheDocument())
    expect(gets).toHaveLength(1)
  })
})

/**
 * A user who plans ahead must be able to SEE the week they planned, not just the
 * current one — and anything they add by hand while looking at it must file into
 * that same week, not silently land on "this week" behind their back.
 */
describe('ShoppingListPage — week switcher', () => {
  it('steps the viewed week', async () => {
    const seen: string[] = []
    server.use(
      http.get('/api/shopping-list', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('weekStart') ?? '')
        return HttpResponse.json({ weeks: [emptyWeek], orphanedPurchasedNames: [] })
      }),
    )
    renderRoute('/shopping-list')

    const next = await screen.findByRole('button', { name: /next week/i })
    await userEvent.click(next)

    const expected = new Date(weekStartOf(new Date()))
    expected.setUTCDate(expected.getUTCDate() + 7)
    await waitFor(() => expect(seen).toContain(expected.toISOString()))
  })

  it('files a manual add into the stepped week once one is visible', async () => {
    const seen: string[] = []
    server.use(
      http.get('/api/shopping-list', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('weekStart') ?? '')
        return HttpResponse.json({ weeks: [week], orphanedPurchasedNames: [] })
      }),
      http.post('/api/shopping-list', async ({ request }) => {
        const body = (await request.json()) as { weekStartDate: string }
        seen.push(`POST:${body.weekStartDate}`)
        return HttpResponse.json(
          { id: '1', ingredient: 'x', quantity: '', isPurchased: false, createdAt: '', mealPlanId: null },
          { status: 201 },
        )
      }),
    )
    renderRoute('/shopping-list')

    const next = await screen.findByRole('button', { name: /next week/i })
    await userEvent.click(next)

    const expected = new Date(weekStartOf(new Date()))
    expected.setUTCDate(expected.getUTCDate() + 7)

    await userEvent.click(await screen.findByRole('button', { name: /add something of your own/i }))
    await userEvent.type(screen.getByLabelText('Ingredient'), 'Milk')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(seen).toContain(`POST:${expected.toISOString()}`))
  })

  it('returns to the current week and stops filing adds into the stepped one', async () => {
    server.use(listHandler())
    renderRoute('/shopping-list')

    const next = await screen.findByRole('button', { name: /next week/i })
    await userEvent.click(next)

    // Two controls now read "This week": the scope pill (aria-pressed) and the
    // switcher's back-to-now button (plain). Only the latter is under test here.
    const findBackToNow = () =>
      screen
        .getAllByRole('button', { name: 'This week' })
        .find((button) => !button.hasAttribute('aria-pressed'))

    await waitFor(() => expect(findBackToNow()).toBeTruthy())
    await userEvent.click(findBackToNow()!)

    await waitFor(() => expect(findBackToNow()).toBeUndefined())
  })
})
