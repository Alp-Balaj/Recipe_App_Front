import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useShoppingWeek } from './useShoppingWeek'
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
