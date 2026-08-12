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

import { ApiError, apiFetch } from './client'
import type { Cuisine, DietaryRestriction, RecipeListResponse, RecipeResponse, Visibility } from './types'

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
  // open-loops slice 1. averageRating is null when NOBODY has rated — not 0,
  // which would render as a one-star recipe. ratingCount is the honest probe for
  // "has anyone rated": 0 means no, and it is never null on the wire.
  // myRating is null when the caller has not rated (or is a guest).
  averageRating?: number | null
  ratingCount: number
  // "Has the caller COOKED this" — never "does the caller have a rating on it".
  // The two came apart until KAN-13, when rating a dish you had never made turned
  // this on; the server now derives it from the cook count alone (ADR-0005).
  cookedByMe: boolean
  myRating?: number | null
  // Feed redesign (2026-08-09). madeItCount is how many DISTINCT people logged a cook —
  // NOT the sum of their timesCooked, because "3 made this" is a claim about people.
  // recentMakers is the server-capped handful of them (newest cook first) that the
  // overlapping avatars beside the count render; it is [] when nobody has cooked it.
  // Both count MAKERS only: someone who rated the recipe without cooking it is in
  // neither, and used to be in both (KAN-13).
  madeItCount: number
  recentMakers: UserSummaryResponse[]
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

// ── Feed redesign (2026-08-09): the activity strip ──────────────────────────

/** What a cook did. The verb the rail row renders comes from this. */
export type FeedActivityKind = 'Posted' | 'Liked' | 'Saved' | 'Cooked'

/**
 * One row of GET /feed/activity: who, what they did, and which recipe it was about.
 * `recipeTitle` is carried inline rather than a whole RecipeResponse — the row is one
 * line of text and a link, and the recipe is always one the caller may see.
 */
export interface FeedActivityResponse {
  actor: UserSummaryResponse
  kind: FeedActivityKind
  recipeId: string
  recipeTitle: string
  occurredAt: string
}

/** GET /feed/activity → 200. Cursor-free: `limit` caps the whole answer. */
export interface FeedActivityListResponse {
  items: FeedActivityResponse[]
}

/**
 * GET /feed/activity — recent activity by cooks the caller follows (scope 'following',
 * the default) or by anyone else (scope 'forYou'). One row per actor, newest first, never
 * the caller's own actions. A guest gets 200 + an empty list rather than a 401, so the
 * strip can mount on a guest's /feed without ending their session.
 */
export function getFeedActivity(params: {
  scope?: FeedScope
  limit?: number
  signal?: AbortSignal
}): Promise<FeedActivityListResponse> {
  const { scope, limit, signal } = params
  return apiFetch<FeedActivityListResponse>('/feed/activity', { query: { scope, limit }, signal })
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

// ── open-loops slice 1: cooked + rated ──────────────────────────────────────

/**
 * The caller's own cooked/rated row. Unlike the like/save toggles these
 * endpoints answer 200 with a body rather than 204: the SPA needs the new
 * timesCooked to render "cooked 3 times" and the rating control has to show
 * what it just committed, neither of which is derivable from a 204.
 */
export interface CookedRecipeResponse {
  recipeId: string
  timesCooked: number
  rating?: number | null
  lastCookedAt?: string | null
  /**
   * Whether the caller has COOKED this — the same derivation the envelope and
   * every feed item use, so a cache patched from this reply cannot disagree with
   * the next read of them (KAN-12).
   *
   * Since KAN-13 that derivation is `timesCooked > 0` on every surface, so this
   * field IS technically derivable from the one above it — do not derive it. The
   * rule is the server's and has already changed once (it used to be row
   * existence, which is why rating a dish you never made reported you as having
   * made it), and a patch beats a later read in `useSocialEnvelope`'s merge, so a
   * locally-derived value would overwrite the server's and outlive the fetch that
   * should have corrected it. Read the field; let the rule live in one place.
   */
  cookedByMe: boolean
}

/** POST /recipes/{id}/cooked → 200. Increments; never creates a second row. */
export function markCooked(recipeId: string): Promise<CookedRecipeResponse> {
  return apiFetch<CookedRecipeResponse>(`/recipes/${recipeId}/cooked`, { method: 'POST' })
}

/**
 * PUT /recipes/{id}/rating → 200 | 400 (rating outside 1-5) | 409 (KAN-7: the
 * caller has no cook of their own for this recipe) | 404.
 *
 * It used to create the caller's row when they had never cooked the recipe,
 * at `timesCooked: 0` — which is how a dish nobody made ended up in a
 * collection of dishes they made. It now writes nothing and refuses; see
 * `needsACookFirst` for what a client does about that.
 */
export function rateRecipe(recipeId: string, rating: number): Promise<CookedRecipeResponse> {
  return apiFetch<CookedRecipeResponse>(`/recipes/${recipeId}/rating`, {
    method: 'PUT',
    body: { rating },
  })
}

/**
 * "This rating needs a cook behind it first" — the one 409 PUT /rating can
 * answer (KAN-7), and the signal to offer recording the cook rather than to
 * report a failure.
 *
 * Matched on the STATUS, not the sentence: the server's copy is a server
 * decision and this must not break the day it is reworded. The status is
 * unambiguous because the endpoint has exactly one conflict — see the backend's
 * ADR-0004, which records that a second one would have to arrive with a reason
 * on the wire.
 *
 * Nothing was written when this is true, so the retry after the cook lands is a
 * first rating, not a re-rate.
 */
export function needsACookFirst(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

/**
 * DELETE /recipes/{id}/cooked → 200 (idempotent). "I have never cooked this",
 * and priced accordingly: it hard-deletes the caller's rating, their lifetime
 * cook count, AND every logged cook of this recipe — including plan-linked ones
 * and the notes written on them, which are the user's own writing.
 *
 * No surface calls this today. Any that does has to confirm first and name what
 * would be lost, the way the day page's un-cook toggle does (KAN-8). Retracting
 * a rating is NOT this gesture — that is clearRating below (KAN-12).
 */
export function clearCooked(recipeId: string): Promise<CookedRecipeResponse> {
  return apiFetch<CookedRecipeResponse>(`/recipes/${recipeId}/cooked`, { method: 'DELETE' })
}

/**
 * DELETE /recipes/{id}/rating → 200 (idempotent). Takes back the rating and
 * nothing else: the cooks, their notes and the count all stay, because rating
 * and cooking are separate claims (KAN-12).
 *
 * The reply is the row that is LEFT, not a zeroed one — `timesCooked` is how
 * the caller learns whether anything remains, which is what the cookedByMe
 * patch in useSocialMutations reads.
 */
export function clearRating(recipeId: string): Promise<CookedRecipeResponse> {
  return apiFetch<CookedRecipeResponse>(`/recipes/${recipeId}/rating`, { method: 'DELETE' })
}

/** Backend RatingRequestValidator: InclusiveBetween(1, 5). */
export const RATING_MIN = 1
export const RATING_MAX = 5

// ── F1: per-recipe social envelope ──────────────────────────────────────────

/**
 * RecipeSocialResponse — GET /recipes/{id}/social (decision
 * recipe-social-envelope-endpoint, resolving cp08 finding F1): EXACTLY the
 * feed item minus the recipe, derived so the two sources can never disagree
 * (the backend pins the same parity with an integration test).
 */
export type RecipeSocialResponse = Omit<FeedItemResponse, 'recipe'>
// (The made-it pair rides that Omit for free, and an integration test pins the parity.)

/**
 * GET /recipes/{id}/social → 200 | 404. Visibility identical to
 * GET /recipes/{id}: Public, caller-owned (authors see their own recipes at ANY
 * visibility), or — since stream F, decision D6 — an author's FriendsOnly recipe
 * when the caller and the author follow EACH OTHER. Anything else — other users'
 * Private, a FriendsOnly recipe without that mutual follow, soft-deleted,
 * nonexistent — is a 404, never a 403: the convention is that an unreadable
 * recipe is indistinguishable from a missing one, and widening what is readable
 * did not change it. Counts are live per-request; flags are caller-relative.
 * Rides the `social` rate lane.
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
  // open-loops slice 1. Live-counted per read like every other social count;
  // likedByMe is always false for a guest.
  likeCount: number
  likedByMe: boolean
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

/** POST /comments/{id}/likes → 204 (idempotent). Awards the COMMENT's author. */
export function likeComment(commentId: string): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}/likes`, { method: 'POST' })
}

/** DELETE /comments/{id}/likes → 204 (idempotent, unliking nothing is fine). */
export function unlikeComment(commentId: string): Promise<void> {
  return apiFetch<void>(`/comments/${commentId}/likes`, { method: 'DELETE' })
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
  /**
   * Stream G (D10). The field existed on User since the initial migration and
   * reached all three AI system prompts as an absolute constraint, but no
   * endpoint ever read or wrote it — so in practice it was empty for everyone
   * and "your restrictions are absolute" was addressing an empty list. G typed
   * it and gave it this read/write path on the profile pair, beside the other
   * account-level setting.
   */
  dietaryRestrictions: DietaryRestriction[]
  /**
   * Stream K (onboarding). The taste half of the pair, and NOT the same kind of
   * thing as the restrictions above: a restriction is a rule the app must never
   * break, a preference only leans. It weights propose-week's candidates,
   * defaults the generator and breaks ties in chat — it never filters anything,
   * and Discover/feed ordering deliberately ignores it entirely.
   */
  cuisinePreferences: Cuisine[]
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
  /** PUT is a full replace here, like every other field: an empty array clears them. */
  dietaryRestrictions: DietaryRestriction[]
  /** Same full-replace semantics (stream K). */
  cuisinePreferences: Cuisine[]
}

/**
 * CompleteOnboardingRequest — POST /users/me/onboarding, the post-register
 * wizard's one write (stream K).
 *
 * Deliberately not PUT /users/me: that route is a full replace of the whole
 * account, so a wizard using it would have to send a username and a visibility
 * it never asked about, and would silently clear anything it forgot. This
 * writes only what the wizard collects.
 *
 * Sending both lists empty is the SKIP case — a real answer, which the server
 * records so the wizard is not raised again.
 */
export interface CompleteOnboardingRequest {
  cuisinePreferences: Cuisine[]
  dietaryRestrictions: DietaryRestriction[]
}

export function completeOnboarding(
  body: CompleteOnboardingRequest,
): Promise<UserProfileResponse> {
  return apiFetch<UserProfileResponse>('/users/me/onboarding', { method: 'POST', body })
}

/** One follow-list row. Superset of UserSummaryResponse — the feed's shape is untouched. */
export interface FollowListItemResponse {
  id: string
  username: string
  profileImageUrl?: string | null
  /** Caller-relative; always false for guests. */
  followedByMe: boolean
  /** Caller-relative — counts only recipes this caller can open. */
  recipeCount: number
}

/** GET /users/{id}/followers | /following → 200 body (FollowedAt DESC keyset). */
export interface FollowListResponse {
  items: FollowListItemResponse[]
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
  params: { cursor?: string; limit?: number; q?: string; signal?: AbortSignal },
): Promise<FollowListResponse> {
  const { cursor, limit, q, signal } = params
  return apiFetch<FollowListResponse>(`/users/${userId}/followers`, {
    query: { cursor, limit, q },
    signal,
  })
}

/** GET /users/{id}/following — accounts this user follows (FollowedAt DESC keyset). */
export function getFollowing(
  userId: string,
  params: { cursor?: string; limit?: number; q?: string; signal?: AbortSignal },
): Promise<FollowListResponse> {
  const { cursor, limit, q, signal } = params
  return apiFetch<FollowListResponse>(`/users/${userId}/following`, {
    query: { cursor, limit, q },
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
