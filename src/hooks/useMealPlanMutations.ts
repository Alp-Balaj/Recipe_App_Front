// ─────────────────────────────────────────────────────────────────────────
// Plan entry writes (meal-planning-ui plan).
//
// Slots are exclusive and POST is pure-create (meal-planning-v1-semantics #4),
// so moving a meal is DELETE-then-POST — two calls with a window between them.
// If the POST fails we put the entry back where it was; losing a meal because
// the destination was occupied would be the worst possible reading of "move".
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  addMealPlanEntry,
  removeMealPlanEntry,
  type DayName,
  type MealPlanEntry,
  type MealTypeName,
} from '@/api/mealPlans'

export function useMealPlanMutations(planId: string) {
  const queryClient = useQueryClient()
  const detailKey = queryKeys.mealPlans.detail(planId)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: detailKey })

  const addEntry = useMutation({
    mutationFn: (vars: { dayOfWeek: DayName; mealType: MealTypeName; recipeId: string }) =>
      addMealPlanEntry(planId, vars),
    onSuccess: invalidate,
  })

  const removeEntry = useMutation({
    mutationFn: (entryId: string) => removeMealPlanEntry(planId, entryId),
    onSuccess: invalidate,
  })

  const moveEntry = useMutation({
    mutationFn: async ({ entry, toDay, toMeal }: { entry: MealPlanEntry; toDay: DayName; toMeal: MealTypeName }) => {
      await removeMealPlanEntry(planId, entry.id)
      try {
        return await addMealPlanEntry(planId, {
          dayOfWeek: toDay,
          mealType: toMeal,
          recipeId: entry.recipe.id,
        })
      } catch (error) {
        // Put it back. If the restore itself fails there is nothing further we
        // can do client-side — surface the ORIGINAL error either way, since
        // that is the one describing what the user attempted.
        try {
          await addMealPlanEntry(planId, {
            dayOfWeek: entry.dayOfWeek,
            mealType: entry.mealType,
            recipeId: entry.recipe.id,
          })
        } catch {
          // fall through
        }
        throw error
      }
    },
    onSettled: invalidate,
  })

  return { addEntry, removeEntry, moveEntry }
}
