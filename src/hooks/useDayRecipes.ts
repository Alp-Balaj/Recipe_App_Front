// ─────────────────────────────────────────────────────────────────────────
// Full recipe details for the meals planned on one day (meal-plan redesign).
//
// A plan entry's recipe summary carries id / title / imageUrl only — no
// ingredients, no times — so the day page has to fetch each planned recipe in
// full. That is up to three extra requests per day, which is why this uses
// useQueries rather than a loop of useRecipe (hook count must stay stable).
//
// The query key and retry rule deliberately MATCH useRecipe, so these share
// one cache with the recipe detail page: opening a recipe you planned, or
// revisiting a day, costs nothing. A 404 (deleted / no longer visible) is a
// real answer and is not retried — the day page renders that meal without its
// ingredient group rather than failing the whole page.
// ─────────────────────────────────────────────────────────────────────────

import { useQueries } from '@tanstack/react-query'
import { ApiError, apiFetch } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import type { RecipeResponse } from '@/api/types'

export interface DayRecipes {
  /** Planned recipe id → its full detail, for the ids that have resolved. */
  byId: Map<string, RecipeResponse>
  /** At least one detail is still in flight. */
  isLoading: boolean
  /** At least one detail failed — the day still renders, minus that group. */
  isError: boolean
}

export function useDayRecipes(recipeIds: readonly string[]): DayRecipes {
  const results = useQueries({
    queries: recipeIds.map((id) => ({
      queryKey: queryKeys.recipes.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiFetch<RecipeResponse>(`/recipes/${id}`, { signal }),
      retry: (failureCount: number, error: Error) =>
        !(error instanceof ApiError && error.status === 404) && failureCount < 1,
    })),
  })

  const byId = new Map<string, RecipeResponse>()
  for (const result of results) {
    if (result.data) byId.set(result.data.id, result.data)
  }

  return {
    byId,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  }
}
