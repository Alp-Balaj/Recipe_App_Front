// ─────────────────────────────────────────────────────────────────────────
// One recipe's comment list — GET /recipes/{id}/comments via useInfiniteQuery
// (social-feed cp06). Same keyset machinery as useFeed: nextCursor goes back
// verbatim as ?cursor=, null ends pagination. Newest first (CreatedAt DESC).
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getComments } from '@/api/social'

/** Rows per comments page. Backend default is 20, clamped to 50. */
export const COMMENTS_PAGE_SIZE = 10

export function useComments(recipeId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.comments.list(recipeId),
    queryFn: ({ pageParam, signal }) =>
      getComments(recipeId, { cursor: pageParam, limit: COMMENTS_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  })
}
