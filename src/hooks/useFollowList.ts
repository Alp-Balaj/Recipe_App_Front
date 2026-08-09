// ─────────────────────────────────────────────────────────────────────────
// Follower / following lists — GET /users/{id}/followers | /following via
// useInfiniteQuery (desktop follow list plan). FollowedAt DESC keyset; items
// are FollowListItemResponse (id, username, avatar, recipeCount, and a
// per-row followedByMe flag caller-relative to the signed-in user), so
// FollowListPage can render and toggle follow state directly on each row
// instead of linking out to profiles. `q` optionally filters rows by
// username substring, debounced by the caller.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getFollowers, getFollowing } from '@/api/social'

export type FollowListKind = 'followers' | 'following'

/** Rows per page. Backend default is 20, clamped to 50. */
export const FOLLOW_PAGE_SIZE = 20

/** One follow list (followers or following) for a user, paged, optionally filtered. */
export function useFollowList(
  userId: string | undefined,
  kind: FollowListKind,
  enabled = true,
  q = '',
) {
  const key = kind === 'followers' ? queryKeys.users.followers : queryKeys.users.following
  const fetcher = kind === 'followers' ? getFollowers : getFollowing
  return useInfiniteQuery({
    queryKey: key(userId ?? '', q),
    queryFn: ({ pageParam, signal }) =>
      fetcher(userId!, { cursor: pageParam, limit: FOLLOW_PAGE_SIZE, q: q || undefined, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && !!userId,
  })
}
