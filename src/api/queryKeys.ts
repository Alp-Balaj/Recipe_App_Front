// ─────────────────────────────────────────────────────────────────────────
// The single TanStack Query key factory. Lanes import from here so they never
// invent divergent keys (which would break cross-lane cache invalidation).
//
// FROZEN at checkpoint 02: additive-only, coordinated edits from here on.
//
// Convention: keys are hierarchical, so a broad key is a prefix of the narrow
// ones under it — invalidating queryKeys.recipes.all wipes every list/detail.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeListQuery } from './types'

export const queryKeys = {
  auth: {
    /** GET /auth/me — the current session. */
    me: () => ['auth', 'me'] as const,
  },

  recipes: {
    /** Everything recipe-related — invalidate to refetch lists + details. */
    all: ['recipes'] as const,

    /** All list queries (any filter). */
    lists: () => ['recipes', 'list'] as const,
    /** One filtered browse list (checkpoint 04, useInfiniteQuery). */
    list: (filters?: RecipeListQuery) => ['recipes', 'list', filters ?? {}] as const,

    /** The caller's own recipes (checkpoint 06). */
    mine: (filters?: RecipeListQuery) => ['recipes', 'mine', filters ?? {}] as const,

    /** A single recipe by id (checkpoint 03). */
    detail: (id: string) => ['recipes', 'detail', id] as const,
  },

  chat: {
    /** The user's continuous chat thread (checkpoint 07/08 — single-thread v2). */
    messages: () => ['chat', 'messages'] as const,

    // chat-ai v3 (multiple conversations) — SANCTIONED ADDITIVE EDIT, same
    // rationale as the social-feed blocks below: the factory is the one place
    // keys may live. Nothing above changed.
    /** The keyset-paged list of the caller's conversations (useInfiniteQuery). */
    conversations: () => ['chat', 'conversations'] as const,
    /**
     * One conversation's keyset-paged message history (useInfiniteQuery). Note
     * the DISTINCT 'conversation' (singular) segment — it deliberately does NOT
     * sit under `conversations()` so invalidating the list never cascades into
     * (and refetch-clobbers) an open thread's optimistic turns.
     */
    conversationMessages: (conversationId: string) =>
      ['chat', 'conversation', conversationId, 'messages'] as const,
  },

  // social-feed cp05 — SANCTIONED ADDITIVE EDIT to this frozen module (the
  // factory is the one place keys may live, per its own header). Nothing
  // above this comment changed.
  feed: {
    /** Everything feed-related — the optimistic social mutations patch under this. */
    all: ['feed'] as const,
    /**
     * One keyset-paged GET /feed list (cp05, useInfiniteQuery). Feed-tabs
     * addition (2026-07-22, sanctioned additive edit): an optional scope
     * ('forYou' | 'following') keys the two tabs separately; both stay under
     * `all`, so the optimistic social patches land on every tab's cache.
     */
    list: (scope?: 'forYou' | 'following') =>
      scope ? (['feed', 'list', scope] as const) : (['feed', 'list'] as const),
  },

  // social-feed cp06 — SANCTIONED ADDITIVE EDIT to this frozen module (same
  // rationale as the cp05 block above). Nothing above this comment changed.
  comments: {
    /** Every comment list — invalidate to refetch all recipes' comments. */
    all: ['comments'] as const,
    /** One recipe's keyset-paged GET /recipes/{id}/comments (useInfiniteQuery). */
    list: (recipeId: string) => ['comments', 'list', recipeId] as const,
  },
  users: {
    /** Everything user-profile-related. */
    all: ['users'] as const,
    /** GET /users/{id} — a public profile (counts + followedByMe). */
    profile: (id: string) => ['users', 'profile', id] as const,
    /** GET /users/{id}/recipes — the profile grid (useInfiniteQuery). */
    recipes: (id: string) => ['users', 'recipes', id] as const,
    /** GET /users/{id}/followers — the follower list overlay (useInfiniteQuery). */
    followers: (id: string) => ['users', 'followers', id] as const,
    /** GET /users/{id}/following — the following list overlay (useInfiniteQuery). */
    following: (id: string) => ['users', 'following', id] as const,
  },
  saved: {
    /** Everything saved-list-related. */
    all: ['saved'] as const,
    /** GET /users/me/saved-recipes — the profile Saved tab (useInfiniteQuery). */
    list: () => ['saved', 'list'] as const,
  },
  social: {
    /** All per-recipe social envelopes (the decision-I3 seam for non-feed surfaces). */
    envelopes: ['social', 'envelope'] as const,
    /** One recipe's cached SocialEnvelope (seeded from feed hits; patched by mutations). */
    envelope: (recipeId: string) => ['social', 'envelope', recipeId] as const,
  },

  // meal-planning-ui plan — SANCTIONED ADDITIVE EDIT to this frozen module (the
  // factory is the one place keys may live, per its own header). Nothing above
  // this comment changed.
  mealPlans: {
    /** Everything plan-related. */
    all: ['mealPlans'] as const,
    /** The keyset-paged list of the caller's weeks (useInfiniteQuery). */
    list: () => ['mealPlans', 'list'] as const,
    /** The plan-id lookup for one exact week (ISO UTC-midnight Monday). */
    week: (weekStart: string) => ['mealPlans', 'week', weekStart] as const,
    /** One plan's full week view. */
    detail: (planId: string) => ['mealPlans', 'detail', planId] as const,
  },
  shoppingList: {
    /** Everything shopping-list-related — generate invalidates this whole subtree. */
    all: ['shoppingList'] as const,
    /** The single per-user keyset-paged list (useInfiniteQuery). */
    list: () => ['shoppingList', 'list'] as const,
  },

  // meal-plan redesign — SANCTIONED ADDITIVE EDIT to this frozen module, same
  // rationale as the blocks above. Nothing already here changed.
  //
  // The picker needs WHOLE bounded lists rather than one page, so it can search
  // them in memory (GET /recipes has no text-search parameter). These keys are
  // deliberately distinct from saved.list() / recipes.mine(), which are the
  // page-at-a-time infinite queries the profile and my-recipes surfaces use.
  picker: {
    /** Everything the recipe picker prefetches. */
    all: ['picker'] as const,
    /** Every page of GET /users/me/saved-recipes, up to a cap. */
    saved: () => ['picker', 'saved'] as const,
    /** The caller's own recipes, scanned out of GET /recipes up to a cap. */
    mine: (userId: string) => ['picker', 'mine', userId] as const,
    /** Recipes drawn from recent meal plans, most recently planned first. */
    history: () => ['picker', 'history'] as const,
  },
} as const
