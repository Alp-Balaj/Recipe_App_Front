// ─────────────────────────────────────────────────────────────────────────
// Recipe-corpus API calls that don't fit under any existing module (task-10,
// meal-planning-week-shopping-rework). Created by that task — same precedent
// as api/shopping.ts / api/mealPlans.ts / api/social.ts: a small file per
// feature area, wire fetchers only, going through the frozen apiFetch
// wrapper. Recipe reads mostly still live inline in the pages/hooks that need
// them; this file is where a recipe-adjacent endpoint with no natural
// existing home lands, and more can join it later.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

/**
 * GET /ingredients/names?q= — distinct ingredient names drawn from the
 * non-deleted recipes the caller may SEE: Public ones plus their own. Still a
 * shared corpus (public recipes dominate it, which is what makes autocomplete
 * converge), but it never suggests another user's private recipe's names.
 * Prefix-matched case-insensitively, capped at 20, alphabetical. A blank q
 * returns the 20 most common names instead.
 *
 * Backs the recipe-form autocomplete (IngredientNameField). It doesn't
 * repair existing IngredientKey groupings — it just stops the corpus
 * diverging further, so shopping-list grouping only improves over time.
 */
export function getIngredientNames(q: string, signal?: AbortSignal): Promise<string[]> {
  return apiFetch<string[]>('/ingredients/names', { query: { q }, signal })
}
