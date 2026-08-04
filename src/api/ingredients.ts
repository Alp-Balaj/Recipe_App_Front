// ─────────────────────────────────────────────────────────────────────────
// The ingredient catalogue (stream G, slice G2/G3).
//
// Replaces api/recipes.ts's getIngredientNames, which asked the backend what
// people had ALREADY TYPED and offered it back. That was the best answer
// available when the only vocabulary was the corpus itself, and its own
// comment conceded the limit: it "just stops the corpus diverging further".
//
// This asks a curated set of ~1,500 canonical ingredients that the WRITE path
// then actually resolves against — so picking a suggestion is a promise (the
// saved recipe carries that ingredient's id) rather than a hint.
//
// The endpoint is anonymous: a catalogue row belongs to nobody, unlike the
// retired one, which had to be caller-scoped so it could not leak a name out
// of someone's private recipe.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

/** RecipeApp.Application.Recipes.Dtos.IngredientResponse */
export interface IngredientResponse {
  id: string
  name: string
  category: string
  /**
   * Grams per millilitre. Null for the entries USDA published no volume
   * portion for, and null must STAY null — falling back to water's 1.0 would
   * silently misreport every unmeasured ingredient by however much it differs
   * from water (about 40% for flour).
   */
  gramsPerMillilitre?: number | null
  gramsPerPiece?: number | null
  kcal?: number | null
  proteinG?: number | null
  fatG?: number | null
  carbsG?: number | null
  fibreG?: number | null
  /** FoodData Central id — the provenance behind every figure above. */
  fdcId: number
}

/** `total` is the catalogue size BEFORE `q` narrowed it, so a picker can say "12 of 1500". */
export interface IngredientListResponse {
  items: IngredientResponse[]
  total: number
}

/**
 * GET /ingredients?q= — search by display name OR by alias.
 *
 * The alias half is what makes this worth having: typing "prawns" finds
 * shrimp, which no substring search over names could do, and it is the same
 * lookup the resolver performs on save. The picker therefore agrees with the
 * write path instead of quietly disagreeing with it.
 */
export function searchIngredients(
  q: string,
  signal?: AbortSignal,
  limit = 25,
): Promise<IngredientListResponse> {
  return apiFetch<IngredientListResponse>('/ingredients', { query: { q, limit }, signal })
}
