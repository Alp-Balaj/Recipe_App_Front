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
// cp06 additions (same verified contract):
//   POST   /recipes/{id}/comments → 201 CommentResponse | 400 | 404
//   GET    /recipes/{id}/comments → 200 CommentListResponse (CreatedAt DESC) | 404
//   PUT    /comments/{id}         → 200 CommentResponse | 400 | 403 | 404
//   DELETE /comments/{id}         → 204 | 403 | 404  (comment author OR recipe author — I6)
//   POST   /users/{id}/follow     → 204 | 400 (self) | 404
//   DELETE /users/{id}/follow     → 204 | 404 (unknown user)
//   GET    /users/{id}            → 200 UserProfileResponse | 404
//   GET    /users/{id}/recipes    → 200 RecipeListResponse | 404
//   GET    /users/me/saved-recipes→ 200 RecipeListResponse (SavedAt DESC)
// All list endpoints: ?cursor&limit (default 20, cap 50, <=0 → 400).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { RecipeListResponse, RecipeResponse } from './types'

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

// ── cp06: comments ──────────────────────────────────────────────────────────

/** CommentResponse — one comment; updatedAt is non-null once edited. */
export interface CommentResponse {
  id: string
  content: string
  createdAt: string
  updatedAt?: string | null
  authorId: string
  authorUsername: string
  recipeId: string
}

/** GET /recipes/{id}/comments → 200 body (CreatedAt DESC keyset). */
export interface CommentListResponse {
  items: CommentResponse[]
  nextCursor?: string | null
}

/** Backend CommentRequestValidator: NotEmpty + MaximumLength(2000). */
export const COMMENT_MAX_LENGTH = 2000

/** GET /recipes/{id}/comments — one keyset page, newest first. */
export function getComments(
  recipeId: string,
  params: { cursor?: string; limit?: number; signal?: AbortSignal },
): Promise<CommentListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<CommentListResponse>(`/recipes/${recipeId}/comments`, {
    query: { cursor, limit },
    signal,
  })
}

/** POST /recipes/{id}/comments → 201 CommentResponse. */
export function addComment(recipeId: string, content: string): Promise<CommentResponse> {
  return apiFetch<CommentResponse>(`/recipes/${recipeId}/comments`, {
    method: 'POST',
    body: { content },
  })
}

/** PUT /comments/{id} → 200 CommentResponse (comment author only — 403 otherwise). */
export function updateComment(commentId: string, content: string): Promise<CommentResponse> {
  return apiFetch<CommentResponse>(`/comments/${commentId}`, {
    method: 'PUT',
    body: { content },
  })
}

/** DELETE /comments/{id} → 204 (comment author OR recipe author — decision I6). */
export function deleteComment(commentId: string): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}`, { method: 'DELETE' })
}

// ── cp06: follow graph + profiles ───────────────────────────────────────────

/** UserProfileResponse — GET /users/{id}. cookingRank is a plain integer. */
export interface UserProfileResponse {
  id: string
  username: string
  bio?: string | null
  profileImageUrl?: string | null
  cookingRank: number
  createdAt: string
  followerCount: number
  followingCount: number
  recipeCount: number
  followedByMe: boolean
}

/** GET /users/{id}/followers | /following → 200 body (FollowedAt DESC keyset). */
export interface FollowListResponse {
  items: UserSummaryResponse[]
  nextCursor?: string | null
}

/** POST /users/{id}/follow → 204 (idempotent; self-follow is a 400). */
export function followUser(userId: string): Promise<void> {
  return apiFetch<void>(`/users/${userId}/follow`, { method: 'POST' })
}

/** DELETE /users/{id}/follow → 204 (idempotent; unknown user is a 404). */
export function unfollowUser(userId: string): Promise<void> {
  return apiFetch<void>(`/users/${userId}/follow`, { method: 'DELETE' })
}

/** GET /users/{id} → 200 UserProfileResponse (recipeCount is caller-visible only). */
export function getUserProfile(userId: string, signal?: AbortSignal): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>(`/users/${userId}`, { signal })
}

/** GET /users/{id}/recipes — that author's recipes visible to the caller (keyset). */
export function getUserRecipes(
  userId: string,
  params: { cursor?: string; limit?: number; signal?: AbortSignal },
): Promise<RecipeListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<RecipeListResponse>(`/users/${userId}/recipes`, {
    query: { cursor, limit },
    signal,
  })
}

// ── cp06: saved list ────────────────────────────────────────────────────────

/**
 * GET /users/me/saved-recipes — the caller's saves, SavedAt DESC keyset.
 * Deleted / no-longer-visible saves are silently omitted by the backend.
 */
export function getSavedRecipes(params: {
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<RecipeListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<RecipeListResponse>('/users/me/saved-recipes', {
    query: { cursor, limit },
    signal,
  })
}
