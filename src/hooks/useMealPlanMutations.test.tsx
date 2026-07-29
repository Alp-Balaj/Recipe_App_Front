import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMealPlanMutations } from './useMealPlanMutations'
import * as api from '@/api/mealPlans'
import { ApiConflictError } from '@/api/client'
import type { MealPlanEntry } from '@/api/mealPlans'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const entry: MealPlanEntry = {
  id: 'e1', dayOfWeek: 'Monday', mealType: 'Breakfast',
  recipe: { id: 'r1', title: 'Toast', imageUrl: null, totalTimeMinutes: 30 },
}

describe('useMealPlanMutations.moveEntry', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the old entry then posts the new slot', async () => {
    const remove = vi.spyOn(api, 'removeMealPlanEntry').mockResolvedValue(undefined)
    const add = vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({ ...entry, id: 'e2', dayOfWeek: 'Friday' })

    const { result } = renderHook(() => useMealPlanMutations('p1'), { wrapper })
    await result.current.moveEntry.mutateAsync({ entry, toDay: 'Friday', toMeal: 'Breakfast' })

    expect(remove).toHaveBeenCalledWith('p1', 'e1')
    expect(add).toHaveBeenCalledWith('p1', { dayOfWeek: 'Friday', mealType: 'Breakfast', recipeId: 'r1' })
  })

  it('restores the original slot when the destination post fails', async () => {
    vi.spyOn(api, 'removeMealPlanEntry').mockResolvedValue(undefined)
    const add = vi.spyOn(api, 'addMealPlanEntry')
      .mockRejectedValueOnce(new ApiConflictError('That day/meal slot is already occupied in this plan.'))
      .mockResolvedValueOnce(entry)

    const { result } = renderHook(() => useMealPlanMutations('p1'), { wrapper })

    await expect(
      result.current.moveEntry.mutateAsync({ entry, toDay: 'Friday', toMeal: 'Breakfast' }),
    ).rejects.toBeInstanceOf(ApiConflictError)

    // Second call is the restore, back to the ORIGINAL slot.
    expect(add).toHaveBeenNthCalledWith(2, 'p1', {
      dayOfWeek: 'Monday', mealType: 'Breakfast', recipeId: 'r1',
    })
  })
})
