import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useMealPlanMutations } from './useMealPlanMutations'
import * as api from '@/api/mealPlans'
import { ApiConflictError } from '@/api/client'
import type { MealPlanEntry, PlannedMealPlanEntry } from '@/api/mealPlans'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// PlannedMealPlanEntry, not MealPlanEntry: addMealPlanEntry only ever resolves to an
// entry that carries its recipe (visibility is checked on the way in — ADR-0001), so the
// mock has to satisfy the same contract the real fetcher promises.
const entry: PlannedMealPlanEntry = {
  id: 'e1', dayOfWeek: 'Monday', mealType: 'Breakfast',
  recipe: { id: 'r1', title: 'Toast', imageUrl: null, totalTimeMinutes: 30 },
}

/** The same slot after its author withdrew the recipe (KAN-1). */
const unavailableEntry: MealPlanEntry = { ...entry, id: 'e9', recipe: null }

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

  // KAN-1. A move is a remove-then-re-add and an unavailable entry cannot be re-added —
  // there is no recipe id, and POST /meal-plans/{id}/entries requires visibility. Refusing
  // AFTER the delete would destroy the slot and fail to restore it, which is precisely the
  // record ADR-0001 says must survive the author's removal. So the assertion that matters
  // is not that it throws — it is that `removeMealPlanEntry` was never reached.
  it('refuses to move an unavailable meal without deleting it first', async () => {
    const remove = vi.spyOn(api, 'removeMealPlanEntry').mockResolvedValue(undefined)
    const add = vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue(entry)

    const { result } = renderHook(() => useMealPlanMutations('p1'), { wrapper })

    await expect(
      result.current.moveEntry.mutateAsync({
        entry: unavailableEntry,
        toDay: 'Friday',
        toMeal: 'Breakfast',
      }),
    ).rejects.toThrow(/no longer available/i)

    expect(remove).not.toHaveBeenCalled()
    expect(add).not.toHaveBeenCalled()
  })
})
