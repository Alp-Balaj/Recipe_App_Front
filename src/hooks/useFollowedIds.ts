// ─────────────────────────────────────────────────────────────────────────
// "Which of these people do I already follow?" — the caller's whole following
// set as a Set of ids (feed redesign, 2026-08-09).
//
// Extracted from the old FeedPage discovery rail, which walked every page of
// GET /users/me/following purely to filter its suggestions. The feed redesign
// needs the same answer in two more places — the hero card's Follow/Following
// pill and the rail's suggestion module — and three copies of a paging effect
// would be three chances to disagree about who is followed.
//
// The walk is bounded by how many people the caller follows, and every page
// shares one query key, so mounting this in several components costs one set
// of requests, not one per caller.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { useFollowList } from './useFollowList'

export function useFollowedIds(enabled = true): Set<string> {
  const { user } = useAuth()
  const list = useFollowList(user?.userId, 'following', enabled)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list

  useEffect(() => {
    if (enabled && hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [enabled, hasNextPage, isFetchingNextPage, fetchNextPage])

  return useMemo(() => {
    const ids = new Set<string>()
    for (const page of list.data?.pages ?? []) {
      for (const u of page.items) ids.add(u.id)
    }
    return ids
  }, [list.data])
}
