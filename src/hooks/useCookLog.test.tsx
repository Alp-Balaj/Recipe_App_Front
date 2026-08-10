import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryKeys } from '@/api/queryKeys'
import { useCookLogMutations } from './useCookLog'
import * as api from '@/api/cookLog'
import type { CookLogEntry } from '@/api/cookLog'

function clientWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const entry: CookLogEntry = {
  id: 'c1',
  recipeId: 'r1',
  recipeTitle: 'Toast',
  mealPlanEntryId: 'e1',
  cookedAt: '2026-08-10T12:00:00Z',
  recipeAvailable: true,
}

/**
 * cooked-per-plan-entry, Task 5: a cook must invalidate the shopping list under
 * the KEY the shop page actually reads, not merely fire SOME invalidation. The
 * feed redesign's cache-key bug (useSocialMutations.test.tsx's header comment)
 * came from a patch aimed at a key that looked right and did not match — this
 * test pins the literal key so that mistake can't repeat here silently.
 */
describe('useCookLogMutations', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('invalidates the shopping list and meal plans under the keys those pages actually read', async () => {
    const log = vi.spyOn(api, 'logCook').mockResolvedValue(entry)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

    result.current.log.mutate({ recipeId: 'r1', mealPlanEntryId: 'e1' })
    await waitFor(() => expect(result.current.log.isSuccess).toBe(true))

    expect(log).toHaveBeenCalledWith('r1', 'e1')
    // Assert the KEY, not merely that an invalidation happened.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.shopping.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.mealPlans.all })
  })

  it('unlog sends the DELETE and invalidates the same four caches as log', async () => {
    const unlog = vi.spyOn(api, 'uncookEntry').mockResolvedValue(undefined)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

    result.current.unlog.mutate({ mealPlanEntryId: 'e1' })
    await waitFor(() => expect(result.current.unlog.isSuccess).toBe(true))

    expect(unlog).toHaveBeenCalledWith('e1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cookLog.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.feed.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.mealPlans.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.shopping.all })
  })
})
