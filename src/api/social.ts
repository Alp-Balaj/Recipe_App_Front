// ─────────────────────────────────────────────────────────────────────────
// Social API — wire shapes + fetchers for the social-feed plan (cp05+).
//
// NEW module (not one of the frozen shared modules), following the lane-C
// `chat.ts` precedent: social-only wire shapes live here, 1:1 with the
// backend DTOs from Plans/social-feed (camelCase, Guids/DateTimes as
// strings), importing the frozen RecipeResponse rather than reshaping it.
//
// Wire contract (backend cp01–03, verified 2026-07-18):
//   GET    /feed                  → 200 FeedListResponse {items, nextCursor, source}
//   POST   /recipes/{id}/likes    → 204 | 404   (idempotent toggle-on)
//   DELETE /recipes/{id}/likes    → 204 | 404   (idempotent toggle-off)
//   POST   /recipes/{id}/saves    → 204 | 404
//   DELETE /recipes/{id}/saves    → 204 | 404
// All list endpoints: ?cursor&limit (default 20, cap 50, <=0 → 400).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { RecipeResponse } from './types'

/** UserSummaryResponse — the compact author block on feed items + follow lists. */
export interface UserSummaryResponse {
  id: string
  username: string
  profileImageUrl?: string | null
}

/**
 * FeedItemResponse — one post: the frozen RecipeResponse plus the social
 * envelope (decision I3: the envelope ships on /feed only).
 */
export interface FeedItemResponse {
  recipe: RecipeResponse
  author: UserSummaryResponse
  likeCount: number
  commentCount: number
  likedByMe: boolean
  savedByMe: boolean
}

/** "following" = posts from followed authors; "discover" = cold-start fallback. */
export type FeedSource = 'following' | 'discover'

/** GET /feed → 200 body. nextCursor is null on the last page. */
export interface FeedListResponse {
  items: FeedItemResponse[]
  nextCursor?: string | null
  source: FeedSource
}

/** GET /feed — one keyset page (cursor passed back verbatim from nextCursor). */
export function getFeedPage(params: {
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<FeedListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<FeedListResponse>('/feed', { query: { cursor, limit }, signal })
}

/** POST /recipes/{id}/likes → 204 (idempotent). */
export function likeRecipe(recipeId: string): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/likes`, { method: 'POST' })
}

/** DELETE /recipes/{id}/likes → 204 (idempotent, unliking nothing is fine). */
export function unlikeRecipe(recipeId: string): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/likes`, { method: 'DELETE' })
}

/** POST /recipes/{id}/saves → 204 (idempotent). */
export function saveRecipe(recipeId: string): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/saves`, { method: 'POST' })
}

/** DELETE /recipes/{id}/saves → 204 (idempotent). */
export function unsaveRecipe(recipeId: string): Promise<void> {
  return apiFetch<void>(`/recipes/${recipeId}/saves`, { method: 'DELETE' })
}
