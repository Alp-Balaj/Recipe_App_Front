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
import { getFeedPage, type FeedScope } from '@/api/social'

/** Rows per feed page. Backend default is 20, clamped to 50. */
export const FEED_PAGE_SIZE = 10

/**
 * One feed tab's list. Each scope ('forYou' | 'following') gets its own query
 * key + pagination; both live under queryKeys.feed.all so the optimistic
 * social mutations patch them together.
 */
export function useFeed(scope?: FeedScope) {
  return useInfiniteQuery({
    queryKey: queryKeys.feed.list(scope),
    queryFn: ({ pageParam, signal }) =>
      getFeedPage({ scope, cursor: pageParam, limit: FEED_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}
