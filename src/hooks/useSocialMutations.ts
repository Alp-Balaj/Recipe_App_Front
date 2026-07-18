// ─────────────────────────────────────────────────────────────────────────
// Optimistic like/save toggles — the ONE shared social-mutation hook
// (social-feed cp05; cp06's detail/browse/profile affordances reuse it).
//
// Contract (from the kickoff): counts and flags update in the cached feed
// envelope WITHOUT refetching the page — onMutate patches every cached query
// under queryKeys.feed.all in place, onError rolls the snapshot back, and
// success does NOT invalidate (the 204 has no body; the optimistic value IS
// the truth). The backend toggles are idempotent (double-tap can't 500), so
// no request de-duplication is needed beyond the flag guard in the patch.
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { likeRecipe, saveRecipe, unlikeRecipe, unsaveRecipe, type FeedItemResponse, type FeedListResponse } from '@/api/social'

/** recipeId + the DESIRED state (true = like/save it, false = undo that). */
export interface SocialToggleVars {
  recipeId: string
  next: boolean
}

type FeedCache = InfiniteData<FeedListResponse>
type Snapshot = [readonly unknown[], FeedCache | undefined][]

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

/** Snapshot every cached feed query so onError can restore it byte-for-byte. */
function snapshotFeedCaches(queryClient: QueryClient): Snapshot {
  return queryClient.getQueriesData<FeedCache>({ queryKey: queryKeys.feed.all })
}

function restoreFeedCaches(queryClient: QueryClient, snapshot: Snapshot): void {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data)
  }
}

/**
 * Like + save toggles with optimistic cache updates. Returns two TanStack
 * mutations; both take {recipeId, next} where `next` is the desired state.
 */
export function useSocialMutations() {
  const queryClient = useQueryClient()

  const toggleLike = useMutation({
    mutationFn: ({ recipeId, next }: SocialToggleVars) =>
      next ? likeRecipe(recipeId) : unlikeRecipe(recipeId),
    onMutate: async ({ recipeId, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.all })
      const snapshot = snapshotFeedCaches(queryClient)
      patchFeedCaches(queryClient, recipeId, (item) =>
        item.likedByMe === next
          ? item // already in the desired state — don't double-count
          : { ...item, likedByMe: next, likeCount: Math.max(0, item.likeCount + (next ? 1 : -1)) },
      )
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context) restoreFeedCaches(queryClient, context.snapshot)
    },
  })

  const toggleSave = useMutation({
    mutationFn: ({ recipeId, next }: SocialToggleVars) =>
      next ? saveRecipe(recipeId) : unsaveRecipe(recipeId),
    onMutate: async ({ recipeId, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feed.all })
      const snapshot = snapshotFeedCaches(queryClient)
      patchFeedCaches(queryClient, recipeId, (item) =>
        item.savedByMe === next ? item : { ...item, savedByMe: next },
      )
      return { snapshot }
    },
    onError: (_err, _vars, context) => {
      if (context) restoreFeedCaches(queryClient, context.snapshot)
    },
  })

  return { toggleLike, toggleSave }
}
