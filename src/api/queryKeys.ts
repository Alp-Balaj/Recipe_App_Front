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
    /** The user's continuous chat thread (checkpoint 07/08). */
    messages: () => ['chat', 'messages'] as const,
  },
} as const
