// ─────────────────────────────────────────────────────────────────────────
// Cooked's one read — GET /users/me/cooked-recipes via useInfiniteQuery
// (KAN-4). LastCookedAt DESC keyset, one row per dish.
//
// Paging is driven entirely by `nextCursor`. The server omits rows it cannot
// render, so a page CAN come back shorter than the page size with more behind
// it — deriving "there is more" from `items.length === PAGE_SIZE` would hide
// the tail of such a list.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getCookedDishes } from '@/api/cooked'

/** Rows per page. Backend default is 20, clamped to 50. */
export const COOKED_PAGE_SIZE = 20

export function useCookedDishes(enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.cooked.list(),
    queryFn: ({ pageParam, signal }) =>
      getCookedDishes({ cursor: pageParam, limit: COOKED_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}
