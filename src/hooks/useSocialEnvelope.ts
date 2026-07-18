// ─────────────────────────────────────────────────────────────────────────
// The decision-I3 seam (social-feed cp06): interaction state for surfaces
// whose wire shape carries NO social envelope (detail, browse, saved tab —
// RecipeResponse stays frozen; the envelope ships on /feed only).
//
// Design: the cached feed pages stay THE server truth. Each non-feed surface
// reads a per-recipe `SocialEnvelope` cache entry (queryKeys.social.envelope)
// that is seeded ONCE from any feed-cache hit (or a caller-provided seed like
// the saved tab's savedByMe:true) and from then on is patched by the same
// shared useSocialMutations that patches the feed pages — one write path, no
// second fetch. Fields are `null` when genuinely unknown (no feed hit and no
// seed): the backend has no per-recipe envelope endpoint, so unknown flags
// render as "not yet" and the idempotent toggles make acting on that safe.
// Known limitation (recorded): a later feed REFETCH does not re-sync an
// already-seeded envelope entry — both caches only drift if another client
// changes state mid-session, and the next mount re-derives.
// ─────────────────────────────────────────────────────────────────────────

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { FeedListResponse } from '@/api/social'

/** Per-recipe interaction state; null = unknown on this surface. */
export interface SocialEnvelope {
  likeCount: number | null
  commentCount: number | null
  likedByMe: boolean | null
  savedByMe: boolean | null
}

export const UNKNOWN_ENVELOPE: SocialEnvelope = {
  likeCount: null,
  commentCount: null,
  likedByMe: null,
  savedByMe: null,
}

/** Scan every cached feed page for this recipe's envelope. */
export function readEnvelopeFromFeedCaches(
  queryClient: QueryClient,
  recipeId: string,
): SocialEnvelope | null {
  const caches = queryClient.getQueriesData<InfiniteData<FeedListResponse>>({
    queryKey: queryKeys.feed.all,
  })
  for (const [, data] of caches) {
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        if (item.recipe.id === recipeId) {
          return {
            likeCount: item.likeCount,
            commentCount: item.commentCount,
            likedByMe: item.likedByMe,
            savedByMe: item.savedByMe,
          }
        }
      }
    }
  }
  return null
}

/**
 * Subscribe to a recipe's SocialEnvelope. Derives once from the feed caches
 * (falling back to `seed`, then to all-unknown) and then lives as its own
 * cache entry that useSocialMutations patches optimistically. `seed` is read
 * only on first derivation — pass cache-known facts (e.g. the saved tab's
 * savedByMe: true), not live state.
 */
export function useSocialEnvelope(recipeId: string, seed?: Partial<SocialEnvelope>): SocialEnvelope {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: queryKeys.social.envelope(recipeId),
    queryFn: () =>
      readEnvelopeFromFeedCaches(queryClient, recipeId) ?? { ...UNKNOWN_ENVELOPE, ...seed },
    staleTime: Infinity,
  })
  return data ?? { ...UNKNOWN_ENVELOPE, ...seed }
}
