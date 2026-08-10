// ─────────────────────────────────────────────────────────────────────────
// Optimistic social mutations — the ONE shared hook (social-feed cp05+06).
//
// cp05 contract (unchanged): like/save counts and flags update in the cached
// feed envelope WITHOUT refetching the page — onMutate patches every cached
// query under queryKeys.feed.lists() in place, onError rolls the snapshot back,
// and success does NOT invalidate (the 204 has no body; the optimistic value
// IS the truth). The backend toggles are idempotent (double-tap can't 500).
//
// cp06 extensions, one write path for every surface:
//  - every like/save/comment patch ALSO lands on the per-recipe SocialEnvelope
//    cache (the decision-I3 seam for detail/browse/saved — see
//    useSocialEnvelope.ts); unknown (null) counts stay null rather than
//    inventing numbers.
//  - toggleSave keeps the saved list truthful: unsave optimistically drops the
//    recipe from cached /users/me/saved-recipes pages; save invalidates the
//    saved list on success (we may not hold the RecipeResponse to prepend).
//  - toggleFollow patches the cached UserProfileResponse (followedByMe +
//    followerCount) optimistically with rollback, and marks /feed stale.
//  - comment CRUD (add/update/delete) patches the comment list cache on
//    SUCCESS (the server owns ids/timestamps) and bumps/drops commentCount in
//    the feed + envelope caches — no page refetch (kickoff mandate).
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  addComment,
  clearCooked,
  deleteComment,
  followUser,
  likeComment,
  likeRecipe,
  markCooked,
  rateRecipe,
  saveRecipe,
  unfollowUser,
  unlikeComment,
  unlikeRecipe,
  unsaveRecipe,
  updateComment,
  type CommentListResponse,
  type CommentResponse,
  type CookedRecipeResponse,
  type FeedItemResponse,
  type FeedListResponse,
  type FollowListResponse,
  type UserProfileResponse,
} from '@/api/social'
import type { RecipeListResponse } from '@/api/types'
import { UNKNOWN_ENVELOPE, type SocialEnvelope } from './useSocialEnvelope'

/** recipeId + the DESIRED state (true = like/save it, false = undo that). */
export interface SocialToggleVars {
  recipeId: string
  next: boolean
}

/** userId + the DESIRED follow state. */
export interface FollowToggleVars {
  userId: string
  next: boolean
}

/** commentId + the DESIRED like state. recipeId locates the cached page. */
export interface CommentLikeVars {
  commentId: string
  recipeId: string
  next: boolean
}

/**
 * Rating is a SET, not a toggle: `rating` is the star the user picked, or null
 * to retract (which clears the cook count too — the backend drops the row).
 */
export interface RateVars {
  recipeId: string
  rating: number | null
}

type FeedCache = InfiniteData<FeedListResponse>
type CommentsCache = InfiniteData<CommentListResponse>
type SavedCache = InfiniteData<RecipeListResponse>
type Snapshot = [readonly unknown[], unknown][]

// ── Cache patch helpers ─────────────────────────────────────────────────────

/**
 * Patch one recipe's envelope in every cached feed LIST query (all pages).
 *
 * `feed.lists()`, not `feed.all`: the feed subtree stopped being uniformly
 * infinite-list-shaped when the redesign added GET /feed/activity under
 * ['feed', 'activity', scope] (a plain useQuery returning `{ items }`, no
 * `pages`). Matching on `feed.all` handed that entry to this updater, whose
 * `data.pages.map` threw a TypeError out of onMutate — which means React Query
 * never ran mutationFn, so every like and save on every surface silently
 * stopped reaching the server. The `pages` guard below is the second line of
 * defence for the next non-list query someone parks under this subtree.
 */
function patchFeedCaches(
  queryClient: QueryClient,
  recipeId: string,
  patch: (item: FeedItemResponse) => FeedItemResponse,
): void {
  queryClient.setQueriesData<FeedCache>({ queryKey: queryKeys.feed.lists() }, (data) => {
    if (!data?.pages) return data
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.recipe.id === recipeId ? patch(item) : item)),
      })),
    }
  })
}

/**
 * F1: settle the recipe's envelope entry before an optimistic like/save patch.
 * The detail page's GET /recipes/{id}/social fallback may still be in flight —
 * cancel it (its late result must not clobber the patch) and make sure an
 * entry EXISTS to patch (patchEnvelopeCache skips missing entries, which
 * would silently drop the user's toggle on a surface still waiting for the
 * fallback). The seeded all-unknown entry keeps the "no invented counts" rule:
 * flags flip, null counts stay null.
 */
async function settleEnvelopeEntry(queryClient: QueryClient, recipeId: string): Promise<void> {
  const key = queryKeys.social.envelope(recipeId)
  await queryClient.cancelQueries({ queryKey: key })
  if (queryClient.getQueryData<SocialEnvelope>(key) === undefined) {
    queryClient.setQueryData<SocialEnvelope>(key, { ...UNKNOWN_ENVELOPE })
  }
}

/** Patch the recipe's standalone SocialEnvelope entry IF a surface created one. */
function patchEnvelopeCache(
  queryClient: QueryClient,
  recipeId: string,
  patch: (env: SocialEnvelope) => SocialEnvelope,
): void {
  queryClient.setQueryData<SocialEnvelope>(queryKeys.social.envelope(recipeId), (env) =>
    env ? patch(env) : env,
  )
}

/** commentCount ± delta across the feed pages + the envelope entry (null-safe). */
function patchCommentCount(queryClient: QueryClient, recipeId: string, delta: number): void {
  patchFeedCaches(queryClient, recipeId, (item) => ({
    ...item,
    commentCount: Math.max(0, item.commentCount + delta),
  }))
  patchEnvelopeCache(queryClient, recipeId, (env) => ({
    ...env,
    commentCount: env.commentCount === null ? null : Math.max(0, env.commentCount + delta),
  }))
}

/** Patch the cached comments pages for one recipe (no-op when nothing cached). */
function patchCommentsCache(
  queryClient: QueryClient,
  recipeId: string,
  patch: (data: CommentsCache) => CommentsCache,
): void {
  queryClient.setQueryData<CommentsCache>(queryKeys.comments.list(recipeId), (data) =>
    data ? patch(data) : data,
  )
}

/**
 * The caller's own rating is the ONLY contribution that changes, so the new
 * average is derivable from the old one — no refetch and no invented numbers.
 * `previous`/`next` are null for "not rated". Returns a null average when the
 * last rating is retracted: 0 would render as one star.
 */
export function recomputeAverage(
  average: number | null,
  count: number,
  previous: number | null,
  next: number | null,
): { average: number | null; count: number } {
  const total = average === null ? 0 : average * count
  const totalWithoutMine = previous === null ? total : total - previous
  const countWithoutMine = previous === null ? count : count - 1
  const newCount = next === null ? countWithoutMine : countWithoutMine + 1
  if (newCount <= 0) return { average: null, count: 0 }
  const newTotal = next === null ? totalWithoutMine : totalWithoutMine + next
  return { average: newTotal / newCount, count: newCount }
}

/** Patch one comment inside the cached comments pages for a recipe. */
function patchOneComment(
  queryClient: QueryClient,
  recipeId: string,
  commentId: string,
  patch: (comment: CommentResponse) => CommentResponse,
): void {
  queryClient.setQueryData<CommentsCache>(queryKeys.comments.list(recipeId), (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((c) => (c.id === commentId ? patch(c) : c)),
          })),
        }
      : data,
  )
}

/** Matches every cached follow list, whoever's profile it belongs to. */
const FOLLOW_LIST_QUERIES = {
  predicate: (query: { queryKey: readonly unknown[] }) =>
    query.queryKey[0] === 'users' &&
    (query.queryKey[1] === 'followers' || query.queryKey[1] === 'following'),
} as const

type FollowListCache = InfiniteData<FollowListResponse>

/**
 * Flip followedByMe on one person across EVERY cached follow list.
 *
 * A predicate rather than a key: the same person appears in the follow lists of
 * every profile the reader has visited, and patching one key leaves the rest
 * showing the opposite of what the preview pane shows.
 */
function patchFollowListCaches(queryClient: QueryClient, userId: string, next: boolean): void {
  queryClient.setQueriesData<FollowListCache>(FOLLOW_LIST_QUERIES, (data) => {
    if (!data) return data
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((u) => (u.id === userId ? { ...u, followedByMe: next } : u)),
      })),
    }
  })
}

/** Snapshot every cached query under the given key prefixes for rollback. */
function snapshotCaches(queryClient: QueryClient, keys: readonly (readonly unknown[])[]): Snapshot {
  return keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }))
}

function restoreCaches(queryClient: QueryClient, snapshot: Snapshot): void {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data)
  }
}

/**
 * The shared social mutations. All toggles take a DESIRED state (`next`) so a
 * rapid double-tap can't get out of sync; the same-state guards below make a
 * duplicate patch a no-op instead of a double count.
 */
export function useSocialMutations() {
  const queryClient = useQueryClient()

  const toggleLike = useMutation({
    mutationFn: ({ recipeId, next }: SocialToggleVars) =>
      next ? likeRecipe(recipeId) : unlikeRecipe(recipeId),
    onMutate: async ({ recipeId, next }) => {
      // Cancel and snapshot exactly what gets patched — the activity strip is
      // neither, and cancelling its in-flight fetch would leave the rail empty.
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.lists() })
      await settleEnvelopeEntry(queryClient, recipeId)
      const snapshot = snapshotCaches(queryClient, [
        queryKeys.feed.lists(),
        queryKeys.social.envelope(recipeId),
      ])
      patchFeedCaches(queryClient, recipeId, (item) =>
        item.likedByMe === next
          ? item // already in the desired state — don't double-count
          : { ...item, likedByMe: next, likeCount: Math.max(0, item.likeCount + (next ? 1 : -1)) },
      )
      patchEnvelopeCache(queryClient, recipeId, (env) =>
        env.likedByMe === next
          ? env
          : {
              ...env,
              likedByMe: next,
              likeCount:
                env.likeCount === null ? null : Math.max(0, env.likeCount + (next ? 1 : -1)),
            },
      )
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context) restoreCaches(queryClient, context.snapshot)
    },
  })

  const toggleSave = useMutation({
    mutationFn: ({ recipeId, next }: SocialToggleVars) =>
      next ? saveRecipe(recipeId) : unsaveRecipe(recipeId),
    onMutate: async ({ recipeId, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.lists() })
      await queryClient.cancelQueries({ queryKey: queryKeys.saved.all })
      await settleEnvelopeEntry(queryClient, recipeId)
      const snapshot = snapshotCaches(queryClient, [
        queryKeys.feed.lists(),
        queryKeys.social.envelope(recipeId),
        queryKeys.saved.all,
      ])
      patchFeedCaches(queryClient, recipeId, (item) =>
        item.savedByMe === next ? item : { ...item, savedByMe: next },
      )
      patchEnvelopeCache(queryClient, recipeId, (env) => ({ ...env, savedByMe: next }))
      if (!next) {
        // Unsave: drop the recipe from the cached saved list immediately.
        queryClient.setQueriesData<SavedCache>({ queryKey: queryKeys.saved.all }, (data) => {
          if (!data) return data
          return {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.filter((r) => r.id !== recipeId),
            })),
          }
        })
      }
      return { snapshot }
    },
    onSuccess: (_data, { next }) => {
      // Save: the saved list gained a row server-side and we may not hold the
      // RecipeResponse to prepend — mark it stale (refetches only if mounted).
      if (next) queryClient.invalidateQueries({ queryKey: queryKeys.saved.all })
    },
    onError: (_err, _vars, context) => {
      if (context) restoreCaches(queryClient, context.snapshot)
    },
  })

  const toggleFollow = useMutation({
    mutationFn: ({ userId, next }: FollowToggleVars) =>
      next ? followUser(userId) : unfollowUser(userId),
    onMutate: async ({ userId, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.profile(userId) })
      // The follow lists get patched below too — an in-flight refetch (a
      // Try-again, or a sibling fetchNextPage) landing after that patch would
      // clobber it, so cancel those in-flight requests as well.
      await queryClient.cancelQueries(FOLLOW_LIST_QUERIES)
      const snapshot = snapshotCaches(queryClient, [queryKeys.users.profile(userId)])
      // snapshotCaches takes explicit keys; the follow lists are matched by predicate, so
      // they are snapshotted here instead.
      const followLists = queryClient.getQueriesData<FollowListCache>(FOLLOW_LIST_QUERIES)

      queryClient.setQueryData<UserProfileResponse>(queryKeys.users.profile(userId), (profile) =>
        !profile || profile.followedByMe === next
          ? profile
          : {
              ...profile,
              followedByMe: next,
              followerCount: Math.max(0, profile.followerCount + (next ? 1 : -1)),
            },
      )
      patchFollowListCaches(queryClient, userId, next)

      return { snapshot, followLists }
    },
    onSuccess: () => {
      // The follow graph changed, so /feed contents (and its following/discover
      // source) are stale. Mark stale — refetches only when observed.
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all })
    },
    onError: (_err, _vars, context) => {
      if (!context) return
      restoreCaches(queryClient, context.snapshot)
      for (const [key, data] of context.followLists) {
        queryClient.setQueryData(key, data)
      }
    },
  })

  // ── open-loops slice 1: rating + cooked ──────────────────────────────────

  const setRating = useMutation({
    mutationFn: ({ recipeId, rating }: RateVars) =>
      rating === null ? clearCooked(recipeId) : rateRecipe(recipeId, rating),
    onMutate: async ({ recipeId, rating }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.lists() })
      await settleEnvelopeEntry(queryClient, recipeId)
      const snapshot = snapshotCaches(queryClient, [
        queryKeys.feed.lists(),
        queryKeys.social.envelope(recipeId),
      ])

      patchFeedCaches(queryClient, recipeId, (item) => {
        if ((item.myRating ?? null) === rating) return item
        const next = recomputeAverage(
          item.averageRating ?? null,
          item.ratingCount,
          item.myRating ?? null,
          rating,
        )
        return {
          ...item,
          myRating: rating,
          averageRating: next.average,
          ratingCount: next.count,
          // Retracting a rating drops the whole row, cook count included.
          cookedByMe: rating === null ? false : item.cookedByMe,
        }
      })

      patchEnvelopeCache(queryClient, recipeId, (env) => {
        if (env.myRating === rating) return env
        // Counts we don't know stay unknown — the flag may still flip.
        const next =
          env.ratingCount === null
            ? { average: env.averageRating, count: null as number | null }
            : recomputeAverage(env.averageRating, env.ratingCount, env.myRating, rating)
        return {
          ...env,
          myRating: rating,
          averageRating: next.average,
          ratingCount: next.count,
          cookedByMe: rating === null ? false : env.cookedByMe,
        }
      })

      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context) restoreCaches(queryClient, context.snapshot)
    },
  })

  /**
   * "I cooked this" is not a toggle and has no count in the envelope — the
   * server's reply carries timesCooked for the caller to surface. All the
   * shared caches need to learn is that cookedByMe is now true.
   *
   * `networkMode: 'always'` (stream M) — the ONE place this hook opts out of
   * react-query's default. By default a mutation fired while the browser
   * reports itself offline is PAUSED rather than failed, on the promise that it
   * resumes when connectivity returns. Cook mode's browser pass could not make
   * that promise come true: with the network restored and an `online` event
   * dispatched by hand, the paused mutation sat there for thirty seconds and
   * the cook was never logged.
   *
   * A silent pause with no resume is the worst of the three outcomes — worse
   * than an error, because nothing tells the person their cook did not land.
   * 'always' lets the request go out and FAIL, which gives the surface an error
   * to show and the user a retry to press. Cook mode's finish panel is built on
   * exactly that, and MealCard's "I cooked this" is no worse off: it had no
   * pending-state UI either way.
   */
  const logCooked = useMutation({
    networkMode: 'always',
    mutationFn: ({ recipeId }: { recipeId: string }) => markCooked(recipeId),
    onSuccess: (_row: CookedRecipeResponse, { recipeId }) => {
      patchFeedCaches(queryClient, recipeId, (item) =>
        item.cookedByMe ? item : { ...item, cookedByMe: true },
      )
      patchEnvelopeCache(queryClient, recipeId, (env) =>
        env.cookedByMe === true ? env : { ...env, cookedByMe: true },
      )
    },
  })

  // ── Comments (cache-patched on success; the server owns ids/timestamps) ──

  const toggleCommentLike = useMutation({
    mutationFn: ({ commentId, next }: CommentLikeVars) =>
      next ? likeComment(commentId) : unlikeComment(commentId),
    onMutate: async ({ commentId, recipeId, next }) => {
      const key = queryKeys.comments.list(recipeId)
      await queryClient.cancelQueries({ queryKey: key })
      const snapshot = snapshotCaches(queryClient, [key])
      patchOneComment(queryClient, recipeId, commentId, (c) =>
        c.likedByMe === next
          ? c // already in the desired state — don't double-count
          : { ...c, likedByMe: next, likeCount: Math.max(0, c.likeCount + (next ? 1 : -1)) },
      )
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context) restoreCaches(queryClient, context.snapshot)
    },
  })

  const addCommentMutation = useMutation({
    mutationFn: ({ recipeId, content }: { recipeId: string; content: string }) =>
      addComment(recipeId, content),
    onSuccess: (created: CommentResponse, { recipeId }) => {
      const cached = queryClient.getQueryData<CommentsCache>(queryKeys.comments.list(recipeId))
      if (cached) {
        // Newest-first list → prepend to the first page.
        patchCommentsCache(queryClient, recipeId, (data) => ({
          ...data,
          pages: data.pages.map((page, i) =>
            i === 0 ? { ...page, items: [created, ...page.items] } : page,
          ),
        }))
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.comments.list(recipeId) })
      }
      patchCommentCount(queryClient, recipeId, +1)
    },
  })

  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; recipeId: string; content: string }) =>
      updateComment(commentId, content),
    onSuccess: (updated: CommentResponse, { recipeId }) => {
      patchCommentsCache(queryClient, recipeId, (data) => ({
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.map((c) => (c.id === updated.id ? updated : c)),
        })),
      }))
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: ({ commentId }: { commentId: string; recipeId: string }) =>
      deleteComment(commentId),
    onSuccess: (_data, { commentId, recipeId }) => {
      patchCommentsCache(queryClient, recipeId, (data) => ({
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          items: page.items.filter((c) => c.id !== commentId),
        })),
      }))
      patchCommentCount(queryClient, recipeId, -1)
    },
  })

  return {
    toggleLike,
    toggleSave,
    toggleFollow,
    setRating,
    logCooked,
    toggleCommentLike,
    addComment: addCommentMutation,
    updateComment: updateCommentMutation,
    deleteComment: deleteCommentMutation,
  }
}
