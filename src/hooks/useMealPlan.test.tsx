import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useCurrentWeekPlan, useEnsureWeekPlan } from './useMealPlan'
import * as api from '@/api/mealPlans'
import { ApiConflictError } from '@/api/client'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useCurrentWeekPlan', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('exposes the plan id when the week has a plan', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue({
      id: 'p1', weekStartDate: '2026-07-20T00:00:00Z', createdAt: '2026-07-19T00:00:00Z', entryCount: 0,
    })

    const { result } = renderHook(() => useCurrentWeekPlan('2026-07-20T00:00:00.000Z'), { wrapper })

    await waitFor(() => expect(result.current.planId).toBe('p1'))
  })

  it('exposes a null plan id when the week has none', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    const { result } = renderHook(() => useCurrentWeekPlan('2026-07-20T00:00:00.000Z'), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.planId).toBeNull()
  })
})

describe('useEnsureWeekPlan', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates the plan when the week has none', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)
    const create = vi.spyOn(api, 'createMealPlan').mockResolvedValue({
      id: 'new', weekStartDate: '2026-07-20T00:00:00Z', createdAt: '2026-07-19T00:00:00Z', entries: [],
    })

    const { result } = renderHook(() => useEnsureWeekPlan(), { wrapper })
    const planId = await result.current.mutateAsync('2026-07-20T00:00:00.000Z')

    expect(create).toHaveBeenCalledWith('2026-07-20T00:00:00.000Z')
    expect(planId).toBe('new')
  })

  it('recovers from a 409 by re-querying the week', async () => {
    // The race: another tab created the plan between our lookup and our POST.
    const lookup = vi.spyOn(api, 'getMealPlanForWeek')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced', weekStartDate: '2026-07-20T00:00:00Z', createdAt: '2026-07-19T00:00:00Z', entryCount: 0 })
    vi.spyOn(api, 'createMealPlan').mockRejectedValue(new ApiConflictError('A meal plan for this week already exists.'))

    const { result } = renderHook(() => useEnsureWeekPlan(), { wrapper })
    const planId = await result.current.mutateAsync('2026-07-20T00:00:00.000Z')

    expect(planId).toBe('raced')
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})
