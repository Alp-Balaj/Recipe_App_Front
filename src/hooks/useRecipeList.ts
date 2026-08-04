import { queryKeys } from '@/api/queryKeys'
import type { Difficulty, Cuisine, RecipeTag } from '@/api/types'
import { useInfiniteRecipes } from './useInfiniteRecipes'

/** Browse filters the UI drives; a subset of RecipeListQuery (no cursor/limit). */
export interface BrowseFilters {
  // Stream G: typed, because an unrecognised cuisine or tag is now a 400 rather
  // than a 200 with no results. The controls are a select and a chip list, so
  // there is no free text left to reach the query string.
  cuisine?: Cuisine
  difficulty?: Difficulty
  tags?: RecipeTag[]
  /**
   * Free-text search (open-loops slice 2) — title, description and ingredient
   * names, matched server-side against a Postgres tsvector. Deliberately NOT
   * lowercased or otherwise mangled the way tags are: the backend hands it to
   * websearch_to_tsquery, which does its own case folding and stemming and
   * understands "quoted phrases" and -negation. Normalising it here would
   * break those.
   */
  search?: string
}

/** Page size for the browse list. Backend default is 20, clamped to 50. */
export const BROWSE_PAGE_SIZE = 12

/**
 * Normalize the filters so the query key is stable and empty values collapse to
 * undefined (omitted from both the request and the key).
 *
 * Stream G removed the tag trim/lowercase that used to live here. It existed to
 * make a free-text filter agree with the case-SENSITIVE backend storage, and a
 * closed vocabulary settles that at the type level — a RecipeTag is already in
 * its canonical form, and lowercasing one would now BREAK the match rather than
 * fix it. De-duping stays: the same chip can still be added twice.
 */
export function normalizeFilters(filters: BrowseFilters): BrowseFilters {
  const cuisine = filters.cuisine
  const tags = filters.tags
  const uniqueTags = tags && tags.length ? Array.from(new Set(tags)) : undefined
  const search = filters.search?.trim()
  return {
    cuisine: cuisine || undefined,
    difficulty: filters.difficulty,
    tags: uniqueTags,
    // Trimmed only — case and punctuation are the tsquery parser's business.
    search: search ? search : undefined,
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
      search: normalized.search,
    },
  })
}
