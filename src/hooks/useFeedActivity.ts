// ─────────────────────────────────────────────────────────────────────────
// The feed rail's "cooking right now" strip — GET /feed/activity (feed
// redesign, 2026-08-09).
//
// A plain useQuery, not an infinite one: the endpoint is deliberately
// cursor-free (it merges four differently-keyed interaction tables and caps
// the answer), and the rail paints three rows. `enabled` lets the rail skip
// the request entirely at widths where it isn't rendered.
// ─────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getFeedActivity, type FeedScope } from '@/api/social'

/** Rows the rail asks for. The module shows three; the spare covers a de-dupe. */
export const ACTIVITY_LIMIT = 4

export function useFeedActivity(scope: FeedScope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.feed.activity(scope),
    queryFn: ({ signal }) => getFeedActivity({ scope, limit: ACTIVITY_LIMIT, signal }),
    enabled,
  })
}
