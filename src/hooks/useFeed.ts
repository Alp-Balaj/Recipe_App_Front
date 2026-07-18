// ─────────────────────────────────────────────────────────────────────────
// The /feed list — GET /feed via useInfiniteQuery (social-feed cp05).
//
// Same keyset machinery as useInfiniteRecipes (each page's `nextCursor` goes
// back verbatim as ?cursor=; null ends pagination), but over the social
// envelope (FeedListResponse) rather than RecipeListResponse, so it gets its
// own hook instead of widening the consolidation core with a generic.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getFeedPage } from '@/api/social'

/** Rows per feed page. Backend default is 20, clamped to 50. */
export const FEED_PAGE_SIZE = 10

export function useFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.feed.list(),
    queryFn: ({ pageParam, signal }) =>
      getFeedPage({ cursor: pageParam, limit: FEED_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}
