import { queryKeys } from '@/api/queryKeys'
import type { Difficulty } from '@/api/types'
import { useInfiniteRecipes } from './useInfiniteRecipes'

/** Browse filters the UI drives; a subset of RecipeListQuery (no cursor/limit). */
export interface BrowseFilters {
  cuisine?: string
  difficulty?: Difficulty
  tags?: string[]
}

/** Page size for the browse list. Backend default is 20, clamped to 50. */
export const BROWSE_PAGE_SIZE = 12

/**
 * Trim/lowercase-normalize the filters so (a) the query key is stable and
 * (b) tag values match the case-SENSITIVE backend storage (the create form
 * trims + lowercases on write, so filters and stored tags agree). Empty
 * values collapse to undefined so they're omitted from the request + key.
 */
export function normalizeFilters(filters: BrowseFilters): BrowseFilters {
  const cuisine = filters.cuisine?.trim()
  const tags = filters.tags
    ?.map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0)
  const uniqueTags = tags && tags.length ? Array.from(new Set(tags)) : undefined
  return {
    cuisine: cuisine ? cuisine : undefined,
    difficulty: filters.difficulty,
    tags: uniqueTags,
  }
}

/**
 * The browse list — GET /recipes via useInfiniteQuery (checkpoint 04). The
 * keyset cursor from each page's `nextCursor` is passed back verbatim as
 * `?cursor=`; a null nextCursor ends pagination. Changing any filter changes
 * the query key, which resets pagination to page 1 automatically.
 */
export function useRecipeList(filters: BrowseFilters) {
  const normalized = normalizeFilters(filters)
  return useInfiniteRecipes({
    queryKey: queryKeys.recipes.list(normalized),
    pageSize: BROWSE_PAGE_SIZE,
    query: {
      cuisine: normalized.cuisine,
      difficulty: normalized.difficulty,
      tags: normalized.tags,
    },
  })
}
