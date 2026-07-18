// ─────────────────────────────────────────────────────────────────────────
// Public user profiles (social-feed cp06): GET /users/{id} + the profile's
// recipe grid GET /users/{id}/recipes (keyset, visible-to-caller only).
// A 404 is a real "no such user" state (same discipline as useRecipe) — no
// retry; reuse isNotFound from useRecipe to branch on it.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { getUserProfile, getUserRecipes } from '@/api/social'

/** Tiles per grid page — a multiple of the 3-column grid width. */
export const PROFILE_GRID_PAGE_SIZE = 12

/** GET /users/{id} — counts, bio, cookingRank, followedByMe. */
export function useUserProfile(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.profile(userId ?? ''),
    queryFn: ({ signal }) => getUserProfile(userId!, signal),
    enabled: !!userId,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 404) && failureCount < 1,
  })
}

/** GET /users/{id}/recipes — the 3-column profile grid (useInfiniteQuery). */
export function useUserRecipes(userId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.recipes(userId ?? ''),
    queryFn: ({ pageParam, signal }) =>
      getUserRecipes(userId!, { cursor: pageParam, limit: PROFILE_GRID_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!userId,
  })
}
