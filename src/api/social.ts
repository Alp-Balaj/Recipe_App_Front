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
//     feed-tabs addition (2026-07-22): ?scope=forYou|following selects the mode
//     (forYou = everyone-feed, following = followed-only with NO discover
//     fallback); omitted keeps the original following-with-fallback behavior.
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
//   PUT    /users/me              → 200 UserProfileResponse | 400 | 409 (username taken)
//   GET    /users/{id}/recipes    → 200 RecipeListResponse | 404
//   GET    /users/me/saved-recipes→ 200 RecipeListResponse (SavedAt DESC)
// F1 addition (decision recipe-social-envelope-endpoint, verified 2026-07-19):
//   GET    /recipes/{id}/social   → 200 RecipeSocialResponse | 404
// All list endpoints: ?cursor&limit (default 20, cap 50, <=0 → 400).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { RecipeListResponse, RecipeResponse, Visibility } from './types'

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

/**
 * "following" = posts from followed authors; "discover" = cold-start fallback
 * (legacy no-scope requests only); "forYou" = the explicit ?scope=forYou
 * everyone-feed (feed-tabs addition, 2026-07-22).
 */
export type FeedSource = 'following' | 'discover' | 'forYou'

/** The caller-requested feed mode — the page's two tabs map 1:1 onto ?scope=. */
export type FeedScope = 'forYou' | 'following'

/** GET /feed → 200 body. nextCursor is null on the last page. */
export interface FeedListResponse {
  items: FeedItemResponse[]
  nextCursor?: string | null
  source: FeedSource
}

/** GET /feed — one keyset page (cursor passed back verbatim from nextCursor). */
export function getFeedPage(params: {
  scope?: FeedScope
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<FeedListResponse> {
  const { scope, cursor, limit, signal } = params
  return apiFetch<FeedListResponse>('/feed', { query: { scope, cursor, limit }, signal })
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

// ── F1: per-recipe social envelope ──────────────────────────────────────────

/**
 * RecipeSocialResponse — GET /recipes/{id}/social (decision
 * recipe-social-envelope-endpoint, resolving cp08 finding F1): EXACTLY the
 * feed item minus the recipe, derived so the two sources can never disagree
 * (the backend pins the same parity with an integration test).
 */
export type RecipeSocialResponse = Omit<FeedItemResponse, 'recipe'>

/**
 * GET /recipes/{id}/social → 200 | 404. Visibility identical to
 * GET /recipes/{id}: Public or caller-owned → 200 (authors see their own
 * recipes at ANY visibility); anything else — other users' Private/
 * FriendsOnly, soft-deleted, nonexistent — is a 404, never a 403. Counts are
 * live per-request; flags are caller-relative. Rides the `social` rate lane.
 */
export function getRecipeSocial(
  recipeId: string,
  signal?: AbortSignal,
): Promise<RecipeSocialResponse> {
  return apiFetch<RecipeSocialResponse>(`/recipes/${recipeId}/social`, { signal })
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
  /** The caller-chosen default visibility applied to new recipes (edited on /profile → Settings). */
  defaultRecipeVisibility: Visibility
}

/**
 * UpdateProfileRequest — PUT /users/me (the account-settings Edit Profile form).
 * Every field is sent on save; `bio`/`profileImageUrl` clear to null when empty.
 */
export interface UpdateProfileRequest {
  username: string
  bio?: string | null
  profileImageUrl?: string | null
  defaultRecipeVisibility: Visibility
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

/**
 * PUT /users/me → 200 updated UserProfileResponse | 400 (validation) |
 * 409 (username taken → ApiConflictError). Updates the caller's own account.
 */
export function updateMyProfile(req: UpdateProfileRequest): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>('/users/me', { method: 'PUT', body: req })
}

/** GET /users/{id} → 200 UserProfileResponse (recipeCount is caller-visible only). */
export function getUserProfile(userId: string, signal?: AbortSignal): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>(`/users/${userId}`, { signal })
}

/** GET /users/{id}/followers — accounts following this user (FollowedAt DESC keyset). */
export function getFollowers(
  userId: string,
  params: { cursor?: string; limit?: number; signal?: AbortSignal },
): Promise<FollowListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<FollowListResponse>(`/users/${userId}/followers`, {
    query: { cursor, limit },
    signal,
  })
}

/** GET /users/{id}/following — accounts this user follows (FollowedAt DESC keyset). */
export function getFollowing(
  userId: string,
  params: { cursor?: string; limit?: number; signal?: AbortSignal },
): Promise<FollowListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<FollowListResponse>(`/users/${userId}/following`, {
    query: { cursor, limit },
    signal,
  })
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
