// ─────────────────────────────────────────────────────────────────────────
// Recipe write mutations (lane B, checkpoints 05/06). Thin wrappers over the
// frozen fetch wrapper + query-key factory:
//   - useCreateRecipe  → POST   /recipes        (201 + created RecipeResponse)
//   - useUpdateRecipe  → PUT    /recipes/{id}   (200 + updated RecipeResponse)
//   - useDeleteRecipe  → DELETE /recipes/{id}   (204, soft delete)
//
// The PUT body is structurally identical to CreateRecipeRequest (the backend's
// UpdateRecipeRequest mirrors it field-for-field), so we reuse that type rather
// than touching the frozen src/api/types.ts.
//
// Cache upkeep on success: invalidate the browse lists + the caller's own list,
// and (on update) seed the detail cache with the fresh response.
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import type { CreateRecipeRequest, RecipeResponse } from '@/api/types'

/** POST /recipes. Reject on the 400 ValidationProblem (mapped by the form). */
export function useCreateRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateRecipeRequest) =>
      apiFetch<RecipeResponse>('/recipes', { method: 'POST', body }),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.recipes.detail(created.id), created)
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.mine() })
    },
  })
}

/** PUT /recipes/{id} full replace. 403/404 surface as ApiError with that status. */
export function useUpdateRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateRecipeRequest }) =>
      apiFetch<RecipeResponse>(`/recipes/${id}`, { method: 'PUT', body }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.recipes.detail(updated.id), updated)
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.mine() })
    },
  })
}

/** DELETE /recipes/{id} soft delete → 204. Drops the recipe from every cache. */
export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.recipes.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.lists() })
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.mine() })
    },
  })
}
