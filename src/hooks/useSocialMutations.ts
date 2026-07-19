// ─────────────────────────────────────────────────────────────────────────
// Optimistic social mutations — the ONE shared hook (social-feed cp05+06).
//
// cp05 contract (unchanged): like/save counts and flags update in the cached
// feed envelope WITHOUT refetching the page — onMutate patches every cached
// query under queryKeys.feed.all in place, onError rolls the snapshot back,
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
  deleteComment,
  followUser,
  likeRecipe,
  saveRecipe,
  unfollowUser,
  unlikeRecipe,
  unsaveRecipe,
  updateComment,
  type CommentListResponse,
  type CommentResponse,
  type FeedItemResponse,
  type FeedListResponse,
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

type FeedCache = InfiniteData<FeedListResponse>
type CommentsCache = InfiniteData<CommentListResponse>
type SavedCache = InfiniteData<RecipeListResponse>
type Snapshot = [readonly unknown[], unknown][]

// ── Cache patch helpers ─────────────────────────────────────────────────────

/** Patch one recipe's envelope in every cached feed query (all pages). */
function patchFeedCaches(
  queryClient: QueryClient,
  recipeId: string,
  patch: (item: FeedItemResponse) => FeedItemResponse,
): void {
  queryClient.setQueriesData<FeedCache>({ queryKey: queryKeys.feed.all }, (data) => {
    if (!data) return data
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
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.all })
      await settleEnvelopeEntry(queryClient, recipeId)
      const snapshot = snapshotCaches(queryClient, [
        queryKeys.feed.all,
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
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.all })
      await queryClient.cancelQueries({ queryKey: queryKeys.saved.all })
      await settleEnvelopeEntry(queryClient, recipeId)
      const snapshot = snapshotCaches(queryClient, [
        queryKeys.feed.all,
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
      const snapshot = snapshotCaches(queryClient, [queryKeys.users.profile(userId)])
      queryClient.setQueryData<UserProfileResponse>(queryKeys.users.profile(userId), (profile) =>
        !profile || profile.followedByMe === next
          ? profile
          : {
              ...profile,
              followedByMe: next,
              followerCount: Math.max(0, profile.followerCount + (next ? 1 : -1)),
            },
      )
      return { snapshot }
    },
    onSuccess: () => {
      // The follow graph changed, so /feed contents (and its following/discover
      // source) are stale. Mark stale — refetches only when observed.
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all })
    },
    onError: (_err, _vars, context) => {
      if (context) restoreCaches(queryClient, context.snapshot)
    },
  })

  // ── Comments (cache-patched on success; the server owns ids/timestamps) ──

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
    addComment: addCommentMutation,
    updateComment: updateCommentMutation,
    deleteComment: deleteCommentMutation,
  }
}
