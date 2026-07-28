// ─────────────────────────────────────────────────────────────────────────
// Plan resolution + week view (meal-planning-ui plan).
//
// The awkward shape here is the backend's, not ours: POST /meal-plans 409s on a
// duplicate week without returning the existing plan's id, so "open this week"
// is always lookup-then-maybe-create, and a 409 on the create leg means someone
// else won the race — re-query rather than surface an error.
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { ApiConflictError } from '@/api/client'
import { createMealPlan, getMealPlan, getMealPlanForWeek } from '@/api/mealPlans'

/** Resolves one week to a plan id, or null when the user hasn't planned that week yet. */
export function useCurrentWeekPlan(weekStart: string) {
  const query = useQuery({
    queryKey: queryKeys.mealPlans.week(weekStart),
    queryFn: ({ signal }) => getMealPlanForWeek(weekStart, signal),
  })

  return {
    planId: query.data?.id ?? null,
    isLoading: query.isLoading,
    error: query.error,
  }
}

/** The full week view for a resolved plan id. Disabled until the id exists. */
export function useMealPlanDetail(planId: string | null) {
  return useQuery({
    queryKey: queryKeys.mealPlans.detail(planId ?? 'none'),
    queryFn: ({ signal }) => getMealPlan(planId!, signal),
    enabled: planId !== null,
  })
}

/**
 * Lookup-or-create for a week, resolving to a plan id. A 409 from the create leg
 * means the week was created concurrently — re-query and use the winner's id.
 */
export function useEnsureWeekPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (weekStart: string): Promise<string> => {
      const existing = await getMealPlanForWeek(weekStart)
      if (existing) return existing.id

      try {
        const created = await createMealPlan(weekStart)
        return created.id
      } catch (error) {
        if (error instanceof ApiConflictError) {
          const raced = await getMealPlanForWeek(weekStart)
          if (raced) return raced.id
        }
        throw error
      }
    },
    onSuccess: (_planId, weekStart) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.week(weekStart) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.list() })
    },
  })
}
