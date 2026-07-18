// ─────────────────────────────────────────────────────────────────────────
// The caller's saved recipes — GET /users/me/saved-recipes via
// useInfiniteQuery (social-feed cp06, the profile Saved tab). SavedAt DESC
// keyset; the backend silently omits deleted / no-longer-visible saves.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getSavedRecipes } from '@/api/social'

/** Rows per saved-list page. Backend default is 20, clamped to 50. */
export const SAVED_PAGE_SIZE = 12

export function useSavedRecipes(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.saved.list(),
    queryFn: ({ pageParam, signal }) =>
      getSavedRecipes({ cursor: pageParam, limit: SAVED_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}
