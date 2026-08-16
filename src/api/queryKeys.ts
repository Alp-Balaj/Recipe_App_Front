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
    // KAN-19 — SANCTIONED ADDITIVE EDIT to this frozen module, the same kind
    // chat-ai v3 and social-feed cp05 landed: a NEW key in an existing
    // namespace, nothing renamed or reshaped. It lives here rather than in the
    // Security settings screen because this file is the one place keys may
    // live — a key declared beside its consumer is a key no other consumer can
    // invalidate.
    /** GET /auth/email-verification — the caller's own address and its status. */
    emailVerification: () => ['auth', 'emailVerification'] as const,
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
    /**
     * Everything feed-related — the INVALIDATION prefix (a follow, an admin hide).
     *
     * Deliberately NOT the prefix the optimistic social patches write through: this
     * subtree holds queries of more than one shape (see `activity` below), and a
     * patcher that assumes the infinite-list shape crashes on the others. Patch
     * through `lists()`; invalidate through `all`.
     */
    all: ['feed'] as const,
    /**
     * Every keyset-paged feed list, whichever tab — the prefix the optimistic
     * like/save/rating/comment patches write through (2026-08-10). Every query
     * under it is an InfiniteData<FeedListResponse>, which is the invariant those
     * patches rely on; `all` is not, and using it here is what broke every like
     * and save once `activity` joined the subtree.
     */
    lists: () => ['feed', 'list'] as const,
    /**
     * One keyset-paged GET /feed list (cp05, useInfiniteQuery). Feed-tabs
     * addition (2026-07-22, sanctioned additive edit): an optional scope
     * ('forYou' | 'following') keys the two tabs separately; both stay under
     * `all`, so the optimistic social patches land on every tab's cache.
     */
    list: (scope?: 'forYou' | 'following') =>
      scope ? (['feed', 'list', scope] as const) : (['feed', 'list'] as const),

    /**
     * Feed redesign (2026-08-09, sanctioned additive edit): GET /feed/activity —
     * the rail's "cooking right now" strip, keyed per scope like the lists.
     *
     * It sits under `all` on purpose, even though the optimistic social patches
     * cannot meaningfully patch it (an activity row is a past event, not a
     * count): a caller invalidating the whole feed subtree after a follow SHOULD
     * refresh whose activity is eligible, which is exactly what this key buys.
     */
    activity: (scope: 'forYou' | 'following') => ['feed', 'activity', scope] as const,
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
    // SANCTIONED ADDITIVE EDIT (desktop follow list): the search term joins the key so a
    // filtered result cannot overwrite the unfiltered list. Defaulted, so every existing
    // caller keeps its current key shape with an empty trailing segment.
    /** GET /users/{id}/followers — the follower list page (useInfiniteQuery). */
    followers: (id: string, q = '') => ['users', 'followers', id, q] as const,
    /** GET /users/{id}/following — the following list page (useInfiniteQuery). */
    following: (id: string, q = '') => ['users', 'following', id, q] as const,
  },
  saved: {
    /** Everything saved-list-related. */
    all: ['saved'] as const,
    /** GET /users/me/saved-recipes — the profile Saved tab (useInfiniteQuery). */
    list: () => ['saved', 'list'] as const,
  },
  // Cooked (KAN-4) — SANCTIONED ADDITIVE EDIT to this frozen module, same rationale
  // as the blocks around it. Nothing already here changed.
  //
  // Shaped like `saved` above because the two are siblings: a per-user collection
  // read one keyset page at a time. Deliberately NOT under `cookLog`, even though
  // both are about cooking — a cook write invalidates `cookLog.all`, and a dish row
  // is a different shape from a cook row, so folding them together would hand a
  // future patcher two shapes under one prefix. That is exactly the assumption the
  // feed redesign's cache-key bug was built on.
  cooked: {
    /** Everything Cooked-related — the invalidation prefix after a cook or a rating. */
    all: ['cooked'] as const,
    // KAN-9: the search term is PART of the key, exactly as it is for the follow
    // lists above. Search is server-side, so "the dishes" and "the dishes matching
    // stew" are two different reads with two different cursors — sharing one key
    // would append a filtered page onto an unfiltered one and page the union of
    // them. Defaulted, so `list()` is still the unfiltered list, and both spellings
    // stay under the `all` prefix every cook/rating invalidation uses.
    /** GET /users/me/cooked-recipes — the dish list (useInfiniteQuery, /cooked). */
    list: (q = '') => ['cooked', 'list', q] as const,
    // KAN-5. Under the same `all` prefix as the list on purpose: a cook or a
    // rating changes both the row and the header, and one invalidation should
    // reach both.
    /** GET /users/me/cooked-recipes/{id} — one dish's header (/cooked/:recipeId). */
    dish: (recipeId: string) => ['cooked', 'dish', recipeId] as const,
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
  // The old `shoppingList` block (all / list()) was DELETED here by the week/shopping rework's
  // fix wave — explicitly authorised, and safe under the frozen-module rule because that rule
  // protects consumers and this block had zero (verified by grep across src/). It keyed a
  // single per-user keyset-paged list fed by a generate endpoint; both are gone. The
  // projection's keys are `shopping` below.

  // meal-plan redesign — SANCTIONED ADDITIVE EDIT to this frozen module, same
  // rationale as the blocks above. Nothing already here changed.
  //
  // The picker needs WHOLE bounded lists for its three PERSONAL segments (again /
  // saved / mine), so they can be searched in memory: bounded, rankable by the
  // caller's own history, no debounce. That is a different tradeoff from a
  // "GET /recipes has no search" one — the server has taken ?search= since
  // open-loops slice 2 — it is that the picker's own personal corpora are worth
  // prefetching whole and everyone's public recipes are not. KAN-17 moved the
  // picker's All segment onto that server search; it reuses recipes.list()
  // above (keyed by the search term, same as BrowsePage) rather than adding a
  // key here. These keys are deliberately distinct from saved.list() /
  // recipes.mine(), which are the page-at-a-time infinite queries the profile
  // and my-recipes surfaces use.
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

  // week/shopping rework (2026-07-29 design) — SANCTIONED ADDITIVE EDIT to this frozen
  // module, same rationale as the blocks above. Nothing already here changed.
  //
  // Replaces the retired `shoppingList` block (see the note above it): the list is no longer a
  // single per-user keyset page. `all` exists so plan-entry mutations can invalidate the whole
  // subtree in one call — useMealPlanMutations.ts does exactly that, which is what keeps a plan
  // edit from leaving a stale list behind the 30s production staleTime.
  shopping: {
    /** Everything projection-related. */
    all: ['shopping'] as const,
    /** One scope+week projection. `weekStart` is null for scope 'All'. */
    week: (weekStart: string | null, scope: 'Week' | 'All') =>
      ['shopping', 'week', weekStart, scope] as const,
  },
  grocery: {
    /** One plan's grocery insight (size / overlap / outlier). */
    insight: (planId: string) => ['grocery', 'insight', planId] as const,
  },

  // plan-page redesign / roadmap spec 2 — SANCTIONED ADDITIVE EDIT to this frozen
  // module, same rationale as the blocks below. Nothing already here changed.
  cookLog: {
    /**
     * Everything cook-log-related — the INVALIDATION prefix. Logging a cook
     * changes both the latest row and every page of the history, so writes
     * invalidate here rather than trying to patch two differently-shaped caches.
     */
    all: ['cookLog'] as const,
    /** GET /cook-log/latest — the newest cook + the lifetime total (/plan's §3). */
    latest: () => ['cookLog', 'latest'] as const,
    // SANCTIONED ADDITIVE EDIT (KAN-5): the recipe filter joins the key, so one
    // dish's cooks cannot overwrite the unfiltered history. Defaulted, exactly
    // like `users.followers(id, q = '')` above, so /plan/cooks keeps its current
    // key shape with an empty trailing segment.
    /** GET /cook-log — the keyset-paged history (useInfiniteQuery, /plan/cooks). */
    list: (recipeId = '') => ['cookLog', 'list', recipeId] as const,
  },

  // stream D (governor) — SANCTIONED ADDITIVE EDIT to this frozen module, same
  // rationale as the blocks above. Nothing already here changed. The admin
  // surface is role-gated server-side; these keys only exist on /admin.
  admin: {
    /** Everything the admin surface reads — invalidate after any admin action. */
    all: ['admin'] as const,
    /** GET /admin/overview — counts + AI-today (Admin Rework §5.1). */
    overview: () => ['admin', 'overview'] as const,
    /** GET /admin/reports keyset-paged queue, keyed by status filter (useInfiniteQuery). */
    reports: (status: string) => ['admin', 'reports', status] as const,
    /** GET /admin/audit — the append-only action log, newest first. */
    audit: () => ['admin', 'audit'] as const,

    // Admin Rework (stream W0-FE) — SANCTIONED ADDITIVE EDIT to this frozen module,
    // same rationale as the blocks above. Nothing already here changed.
    /** GET /admin/users offset-paged browser, keyed by every filter (search/status/sort/page). */
    users: (params: { search?: string; status?: string; sort?: string; page?: number }) =>
      [...queryKeys.admin.all, 'users', params] as const,
    /** GET /admin/users/{id} — one user's identity + moderation state. */
    user: (id: string) => [...queryKeys.admin.all, 'user', id] as const,
    /** GET /admin/users/{id}/usage — today + all-time AI usage and remaining budget. */
    userUsage: (id: string) => [...queryKeys.admin.all, 'userUsage', id] as const,
    /** GET /admin/events keyset-paged feed, keyed by category filter (useInfiniteQuery). */
    events: (category?: string) => [...queryKeys.admin.all, 'events', category ?? 'all'] as const,
    /** GET /admin/recipes/{id} — the read-only admin recipe view. */
    recipe: (id: string) => [...queryKeys.admin.all, 'recipe', id] as const,
  },

  // open-loops slice 3 — SANCTIONED ADDITIVE EDIT to this frozen module, same rationale
  // as the blocks above. Nothing already here changed.
  //
  // `unread` is deliberately its own key rather than being derived from `list`: the bell
  // polls the count on an interval and must not drag a page of rows along with it, and
  // the page must not be refetched every poll just because the bell is mounted.
  notifications: {
    /** Everything notification-related — the invalidation prefix after marking read. */
    all: ['notifications'] as const,
    /** The keyset-paged list. */
    list: () => ['notifications', 'list'] as const,
    /** Just the badge count. */
    unread: () => ['notifications', 'unread'] as const,
  },
} as const
