// ─────────────────────────────────────────────────────────────────────────
// Follower / following lists — GET /users/{id}/followers | /following via
// useInfiniteQuery (Recipe App Redesign, the profile Followers/Following
// overlay). FollowedAt DESC keyset; items are the compact UserSummaryResponse
// (id, username, avatar) — no per-row followedByMe flag, so the overlay lists
// and links to profiles rather than showing follow state.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getFollowers, getFollowing } from '@/api/social'

export type FollowListKind = 'followers' | 'following'

/** Rows per page. Backend default is 20, clamped to 50. */
export const FOLLOW_PAGE_SIZE = 20

/** One follow list (followers or following) for a user, paged. */
export function useFollowList(userId: string | undefined, kind: FollowListKind, enabled = true) {
  const key = kind === 'followers' ? queryKeys.users.followers : queryKeys.users.following
  const fetcher = kind === 'followers' ? getFollowers : getFollowing
  return useInfiniteQuery({
    queryKey: key(userId ?? ''),
    queryFn: ({ pageParam, signal }) =>
      fetcher(userId!, { cursor: pageParam, limit: FOLLOW_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: enabled && !!userId,
  })
}
