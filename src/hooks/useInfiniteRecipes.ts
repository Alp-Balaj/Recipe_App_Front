// ─────────────────────────────────────────────────────────────────────────
// The one keyset-paginated GET /recipes core, shared by every recipe list.
//
// Consolidation (fe · consolidation): lane A's browse list (useRecipeList) and
// lane B's my-recipes list had two copies of the same useInfiniteQuery wiring —
// same nextCursor machinery, differing only in queryKey, page size, and the
// filter query. Both now flow through here; callers pass those three bits.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { RecipeListResponse } from '@/api/types'

export interface UseInfiniteRecipesOptions {
  /** The TanStack query key (from queryKeys.recipes.*) — drives caching + reset. */
  queryKey: QueryKey
  /** Rows per page; passed as ?limit=. */
  pageSize: number
  /** Extra filter params merged into every page request (cuisine/difficulty/tags). */
  query?: Record<string, string | number | string[] | undefined>
  /**
   * Which list endpoint to page. Defaults to the global `/recipes`; `/recipes/mine`
   * is the caller's own recipes (private drafts included). Both return the same
   * RecipeListResponse with the same cursor semantics, so only the path differs.
   */
  path?: '/recipes' | '/recipes/mine'
}

/**
 * A keyset-paged recipe list via useInfiniteQuery. Each page's `nextCursor` is
 * passed back verbatim as `?cursor=`; a null nextCursor ends pagination.
 * Changing the queryKey resets pagination to page 1 automatically.
 */
export function useInfiniteRecipes({ queryKey, pageSize, query, path = '/recipes' }: UseInfiniteRecipesOptions) {
  return useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      apiFetch<RecipeListResponse>(path, {
        query: { ...query, cursor: pageParam, limit: pageSize },
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}
