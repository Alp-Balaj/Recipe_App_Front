import { useQuery } from '@tanstack/react-query'
import { apiFetch, ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import type { RecipeResponse } from '@/api/types'

/**
 * A single recipe by id — GET /recipes/{id} (checkpoint 03).
 *
 * The backend answers 404 for a nonexistent, soft-deleted, or
 * not-visible-to-you recipe (detail GET never 403s), so a 404 is a real
 * "not found" state, not a transient failure — we don't retry it. Everything
 * else keeps the app's default single retry.
 */
export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.recipes.detail(id ?? ''),
    queryFn: ({ signal }) => apiFetch<RecipeResponse>(`/recipes/${id}`, { signal }),
    enabled: !!id,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  })
}

/** True when a query error is the backend's 404 (recipe not found / not visible). */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}
