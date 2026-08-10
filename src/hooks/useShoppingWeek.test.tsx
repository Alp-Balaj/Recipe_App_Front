import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryKeys } from '@/api/queryKeys'
import { useShoppingMutations, useShoppingWeek } from './useShoppingWeek'
import * as shopping from '@/api/shopping'

// renderHook wrapper following useMealPlan.test.tsx: the `enabled` guard decides
// whether a REQUEST HAPPENS AT ALL, which no page-level test can see — the page
// never passes a null week with scope 'Week'.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useShoppingWeek', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends nothing for scope Week without a week — that request is a guaranteed 400', async () => {
    const get = vi.spyOn(shopping, 'getShoppingList')

    const { result } = renderHook(() => useShoppingWeek(null, 'Week'), { wrapper })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(get).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('still fetches for scope All with no week, because All ignores it', async () => {
    const get = vi
      .spyOn(shopping, 'getShoppingList')
      .mockResolvedValue({ weeks: [], orphanedPurchasedNames: [] })

    renderHook(() => useShoppingWeek(null, 'All'), { wrapper })

    await waitFor(() => expect(get).toHaveBeenCalled())
    expect(get.mock.calls[0][0]).toMatchObject({ weekStart: null, scope: 'All' })
  })
})

/**
 * `restore`'s contract (trust rework, Task 8, tightened by the review round):
 * an explicit unsuppressed mark, and — unlike `setPurchased`/`suppress`/
 * `removeItem` — NO optimistic patch. Only the server holds the group's full
 * shape (aisle, parts, totals, dishes) once it is un-hidden, so the only
 * correct move is to invalidate and let the refetch render it; a patch here
 * would have to fabricate a group from nothing.
 */
describe('useShoppingMutations — restore', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends an explicit unsuppressed mark and invalidates rather than touching the cache', async () => {
    const setMark = vi.spyOn(shopping, 'setMark').mockResolvedValue(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const listKey = queryKeys.shopping.week('2026-07-27T00:00:00.000Z', 'Week')
    // Seeded cache stands in for "the list currently on screen" — if `restore`
    // patched it optimistically (there is nothing here to patch a restored
    // group's full shape INTO), this snapshot would change before the
    // invalidated refetch could run. No query observer is mounted, so
    // `invalidateQueries` only flags the key; it cannot itself trigger a
    // refetch that would also leave this snapshot looking untouched by
    // accident.
    const seeded = { weeks: [], orphanedPurchasedNames: [] }
    client.setQueryData(listKey, seeded)
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    function clientWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(
      () => useShoppingMutations('2026-07-27T00:00:00.000Z', 'Week'),
      { wrapper: clientWrapper },
    )

    result.current.restore.mutate({ weekStartDate: '2026-07-27T00:00:00Z', key: 'onion', isPurchased: false })

    await waitFor(() => expect(result.current.restore.isSuccess).toBe(true))

    expect(setMark).toHaveBeenCalledWith({
      weekStartDate: '2026-07-27T00:00:00Z',
      key: 'onion',
      isPurchased: false,
      isSuppressed: false,
    })
    // The cache this component reads sat untouched throughout — no onMutate patch.
    expect(client.getQueryData(listKey)).toEqual(seeded)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.shopping.all })
  })
})

/**
 * carryItem/dismissCarryover's close-out (fix round 1, Task 10 review): a Manual
 * carryover item with no `manualItemId` can only be a server bug, and used to
 * fall through to `setMark` on its `manual:`-prefixed key — a guaranteed 400,
 * fired AFTER `carryItem`'s add had already succeeded. It must no-op instead.
 */
describe('useShoppingMutations — carryItem/dismissCarryover close-out', () => {
  beforeEach(() => vi.restoreAllMocks())

  function clientWrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
  }

  it('dismissCarryover no-ops rather than sending a guaranteed-400 suppress mark for a Manual item with no id', async () => {
    const setMark = vi.spyOn(shopping, 'setMark').mockResolvedValue(undefined)
    const deleteManualItem = vi.spyOn(shopping, 'deleteManualItem').mockResolvedValue(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useShoppingMutations(null, 'All'), { wrapper: clientWrapper(client) })

    result.current.dismissCarryover.mutate({
      item: { key: 'manual:orphan', displayName: 'Ghost row', remainingDisplay: null, origin: 'Manual', manualItemId: null },
      fromWeek: '2026-07-20T00:00:00Z',
    })

    await waitFor(() => expect(result.current.dismissCarryover.isSuccess).toBe(true))
    expect(setMark).not.toHaveBeenCalled()
    expect(deleteManualItem).not.toHaveBeenCalled()
  })

  it("carryItem's close-out no-ops the same way, after its add still runs", async () => {
    const addManualItem = vi.spyOn(shopping, 'addManualItem').mockResolvedValue({
      id: '1', ingredient: 'Ghost row', quantity: '', isPurchased: false, createdAt: '', mealPlanId: null,
    })
    const setMark = vi.spyOn(shopping, 'setMark').mockResolvedValue(undefined)
    const deleteManualItem = vi.spyOn(shopping, 'deleteManualItem').mockResolvedValue(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useShoppingMutations(null, 'All'), { wrapper: clientWrapper(client) })

    result.current.carryItem.mutate({
      item: { key: 'manual:orphan', displayName: 'Ghost row', remainingDisplay: null, origin: 'Manual', manualItemId: null },
      fromWeek: '2026-07-20T00:00:00Z',
      toWeek: '2026-07-27T00:00:00Z',
    })

    await waitFor(() => expect(result.current.carryItem.isSuccess).toBe(true))
    expect(addManualItem).toHaveBeenCalled()
    expect(setMark).not.toHaveBeenCalled()
    expect(deleteManualItem).not.toHaveBeenCalled()
  })
})
