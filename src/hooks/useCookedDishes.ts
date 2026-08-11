// ─────────────────────────────────────────────────────────────────────────
// Cooked's one read — GET /users/me/cooked-recipes via useInfiniteQuery
// (KAN-4). LastCookedAt DESC keyset, one row per dish.
//
// Paging is driven entirely by `nextCursor`. The server omits rows it cannot
// render, so a page CAN come back shorter than the page size with more behind
// it — deriving "there is more" from `items.length === PAGE_SIZE` would hide
// the tail of such a list.
//
// `q` (KAN-9) is a server parameter, sent with EVERY page and carried in the
// query key. It is never a filter over the pages already loaded: the collection
// is keyset-paged, so a client-side filter would answer for the pages in hand
// and quietly report nothing for a dish the reader definitely cooked.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getCookedDish, getCookedDishes } from '@/api/cooked'

/** Rows per page. Backend default is 20, clamped to 50. */
export const COOKED_PAGE_SIZE = 20

export function useCookedDishes(q = '', enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.cooked.list(q),
    queryFn: ({ pageParam, signal }) =>
      getCookedDishes({ cursor: pageParam, limit: COOKED_PAGE_SIZE, q: q || undefined, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}

/**
 * One dish's header — title, availability, rating, and how many of its cooks
 * predate the cook log (KAN-5).
 *
 * Deliberately a plain `useQuery` beside the page's infinite list of cooks
 * rather than a field on it: the header is read once, the cooks are read per
 * "Show older cooks", and folding them together would re-fetch the header on
 * every page.
 */
export function useCookedDish(recipeId: string) {
  return useQuery({
    queryKey: queryKeys.cooked.dish(recipeId),
    queryFn: ({ signal }) => getCookedDish(recipeId, signal),
  })
}
