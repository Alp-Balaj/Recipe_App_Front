// ─────────────────────────────────────────────────────────────────────────
// Recipe-corpus API calls that don't fit under any existing module (task-10,
// meal-planning-week-shopping-rework). NEW module — same precedent as
// api/shopping.ts / api/mealPlans.ts / api/social.ts: a small file per
// feature area, wire fetchers only, going through the frozen apiFetch
// wrapper. There is no api/recipes.ts yet (recipe reads mostly live inline
// in the pages/hooks that need them), so this is where a recipe-adjacent
// endpoint with no natural existing home lands; more can join it later.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

/**
 * GET /ingredients/names?q= — distinct ingredient names across the whole
 * non-deleted recipe corpus (not just the caller's — ingredient names carry
 * nothing private, and a shared corpus is what makes autocomplete converge).
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
