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
// second fetch. Fields are `null` when genuinely unknown: unknown flags
// render as "not yet" and the idempotent toggles make acting on that safe.
//
// F1 extension (decision recipe-social-envelope-endpoint, 2026-07-19): the
// caches alone are structurally blind for a recipe's OWN AUTHOR (their posts
// never appear in their feed — cp08 finding F1), so callers may opt into a
// network fallback: when the caches can't fully answer, fetch
// GET /recipes/{id}/social ONCE and use it as the seed. Only the DETAIL page
// opts in (one recipe → one cheap request); list surfaces stay cache-only so
// a browse/saved page never fans out N envelope requests. The fetched value
// is still just the first seed — the "seed once, then the shared mutations
// patch" write path is unchanged, as is the recorded no-resync limitation
// below. A 404 (invisible/soft-deleted/nonexistent) or transport error
// degrades to the pre-F1 hidden-counts behavior and is cached (staleTime
// Infinity + retry: false + a per-mount once guard → no request spam).
//
// Known limitation (recorded): a later feed REFETCH does not re-sync an
// already-seeded envelope entry — both caches only drift if another client
// changes state mid-session, and the next mount re-derives.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getRecipeSocial, type FeedListResponse } from '@/api/social'

/**
 * Per-recipe interaction state; null = unknown on this surface.
 *
 * open-loops slice 1 caveat — the rating fields break the "null = unknown"
 * rule, because for two of them null is a REAL value the server sends:
 * `averageRating` is null when nobody has rated, `myRating` is null when the
 * caller has not. Only `ratingCount` and `cookedByMe` carry the unknown/known
 * distinction, which is why isFullyKnown() probes those two and not the other
 * two — treating a legitimately-null average as "unknown" would make the F1
 * fallback refetch on every mount of an unrated recipe, forever.
 *
 * This is safe for rendering because unknown and unrated look identical: no
 * stars either way.
 */
export interface SocialEnvelope {
  likeCount: number | null
  commentCount: number | null
  likedByMe: boolean | null
  savedByMe: boolean | null
  averageRating: number | null
  ratingCount: number | null
  cookedByMe: boolean | null
  myRating: number | null
}

export const UNKNOWN_ENVELOPE: SocialEnvelope = {
  likeCount: null,
  commentCount: null,
  likedByMe: null,
  savedByMe: null,
  averageRating: null,
  ratingCount: null,
  cookedByMe: null,
  myRating: null,
}

/**
 * True when every field is known — nothing left for the F1 fallback to add.
 * See the SocialEnvelope note: averageRating and myRating are deliberately not
 * probed, since null is a legitimate server value for both.
 */
function isFullyKnown(env: SocialEnvelope): boolean {
  return (
    env.likeCount !== null &&
    env.commentCount !== null &&
    env.likedByMe !== null &&
    env.savedByMe !== null &&
    env.ratingCount !== null &&
    env.cookedByMe !== null
  )
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
            averageRating: item.averageRating ?? null,
            ratingCount: item.ratingCount,
            cookedByMe: item.cookedByMe,
            myRating: item.myRating ?? null,
          }
        }
      }
    }
  }
  return null
}

export interface UseSocialEnvelopeOptions {
  /**
   * F1 fallback: when the caches can't fully answer, fetch
   * GET /recipes/{id}/social once and seed the entry from the wire. Opt-in —
   * single-recipe surfaces only (the detail page); leave OFF on list cards
   * so a page of N cards never turns into N requests.
   */
  fetchFallback?: boolean
}

/**
 * Subscribe to a recipe's SocialEnvelope. Derives once from the feed caches
 * (falling back to `seed`, then — with `fetchFallback` — to one
 * GET /recipes/{id}/social, then to all-unknown) and then lives as its own
 * cache entry that useSocialMutations patches optimistically. `seed` is read
 * only on first derivation — pass cache-known facts (e.g. the saved tab's
 * savedByMe: true), not live state.
 */
export function useSocialEnvelope(
  recipeId: string,
  seed?: Partial<SocialEnvelope>,
  options?: UseSocialEnvelopeOptions,
): SocialEnvelope {
  const queryClient = useQueryClient()
  const wantFetch = options?.fetchFallback === true && recipeId !== ''
  // At most ONE endpoint attempt per mount — a 404 must not turn into a poll.
  const attemptedRef = useRef(false)
  const queryKey = queryKeys.social.envelope(recipeId)

  const { data, fetchStatus, refetch } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const local =
        queryClient.getQueryData<SocialEnvelope>(queryKey) ??
        readEnvelopeFromFeedCaches(queryClient, recipeId) ?? { ...UNKNOWN_ENVELOPE, ...seed }
      if (!wantFetch || attemptedRef.current || isFullyKnown(local)) return local
      attemptedRef.current = true
      try {
        const wire = await getRecipeSocial(recipeId, signal)
        // Merge preferring LOCAL non-null fields: an optimistic patch that
        // landed while this request was in flight is the user's own action —
        // fresher than the snapshot the server read. Re-read the entry so
        // such a patch isn't clobbered.
        const latest = queryClient.getQueryData<SocialEnvelope>(queryKey) ?? local
        return {
          likeCount: latest.likeCount ?? wire.likeCount,
          commentCount: latest.commentCount ?? wire.commentCount,
          likedByMe: latest.likedByMe ?? wire.likedByMe,
          savedByMe: latest.savedByMe ?? wire.savedByMe,
          // `??` reads correctly for the rating pair despite their ambiguous
          // null: when local is null-because-unknown the wire value wins, and
          // when local is null-because-unrated the wire is null too.
          averageRating: latest.averageRating ?? wire.averageRating ?? null,
          ratingCount: latest.ratingCount ?? wire.ratingCount,
          cookedByMe: latest.cookedByMe ?? wire.cookedByMe,
          myRating: latest.myRating ?? wire.myRating ?? null,
        }
      } catch (err) {
        if (signal.aborted) {
          // The attempt never completed (StrictMode's dev remount aborts the
          // first mount's fetch; a mutation's cancelQueries does the same on
          // purpose). Re-open the once-guard and let React Query treat this
          // as a real cancellation — no made-up entry is written.
          attemptedRef.current = false
          throw err
        }
        // 404 (invisible/soft-deleted/nonexistent) or transport failure →
        // the pre-F1 hidden-counts degradation. Cached (staleTime Infinity),
        // so this does not re-poll.
        return queryClient.getQueryData<SocialEnvelope>(queryKey) ?? local
      }
    },
    staleTime: Infinity,
    retry: false,
  })

  // Upgrade path: with staleTime Infinity the queryFn never re-runs on its
  // own, so force it ONCE (per the attempted-guard) whenever the entry can't
  // fully answer and nothing is in flight. Covers (a) an entry a browse/saved
  // card derived cache-only before this detail mount, (b) a mutation-patched
  // flag with counts still null, and (c) a fetch aborted before completing
  // (dev StrictMode remount). The queryFn re-derives, fetches, and merges.
  useEffect(() => {
    if (!wantFetch || attemptedRef.current || fetchStatus !== 'idle') return
    if (data && isFullyKnown(data)) return
    refetch()
  }, [wantFetch, data, fetchStatus, refetch])

  return data ?? { ...UNKNOWN_ENVELOPE, ...seed }
}
