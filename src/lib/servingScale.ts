// ─────────────────────────────────────────────────────────────────────────
// Serving scaling, as arithmetic (stream M, decision D17).
//
// The mirror of RecipeApp.Application.Recipes.ServingScale, and it is a mirror
// on purpose rather than a wire call: the cook standing at the stove changes
// the serving count with a tap, and a round trip for a multiplication would be
// a spinner in the middle of cooking. The backend keeps its own copy because
// the cook-mode assistant's prompt must state the SAME numbers the screen
// shows — the two are not layered, they are the same rule applied where each
// side needs it.
//
// ── D17, SETTLED ───────────────────────────────────────────────────────────
// Stream J settled the rendering half: a step's quantity is rendered FROM the
// referenced ingredient line and never repeated in the prose. This settles the
// rest. Scaling happens, it is multiplication, and it touches ingredient
// QUANTITIES and nothing else:
//
//   • Prose is left VERBATIM. Rewriting "add 200 g of flour" to say 400 needs
//     a model, and a model that rewrites a method is a model that can quietly
//     change the method. J's rendering rule is what makes leaving it alone
//     survivable — the authoritative number is the one on the chip. Where the
//     two can disagree (a recipe written before J, or imported by stream L),
//     the cook-mode banner says so in as many words. That honesty is not
//     optional: it is the price of not touching the prose.
//   • Temperature NEVER scales. 180 °C for eight people is 180 °C.
//   • Duration NEVER scales. Doubling a braise does not double the braise.
//
// And scaling is a VIEW. Nothing here writes: the recipe's stored servings is
// the author's statement about the dish, and a reader cooking for eight has
// not edited it.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeIngredient } from '@/api/types'

/**
 * Mirrors ServingScale.MinServings / MaxServings. The picker never offers a
 * value outside them, and the backend 400s one.
 */
export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 100

/**
 * The factor that takes `from` servings to `to`. A non-positive source is 1 —
 * a recipe that claims to serve nobody cannot be scaled, and dividing by it is
 * worse than not scaling.
 */
export function scaleFactor(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return 1
  return to / from
}

/**
 * One quantity, scaled and rounded to the two decimals formatQuantity renders.
 *
 * `ToTaste` is the ONE unit left alone, and the reason is that its quantity is
 * never rendered — formatQuantity drops the number entirely — so scaling it is
 * invisible work. Every other unit's number is read and acted on by a cook,
 * pinches and handfuls included: a handful of spinach for two is not a handful
 * for eight, and leaving "imprecise" units unscaled would silently under-season
 * a doubled recipe.
 */
export function scaleQuantity(
  quantity: number,
  unit: RecipeIngredient['unit'],
  factor: number,
): number {
  if (unit === 'ToTaste' || factor === 1) return quantity
  return Math.round(quantity * factor * 100) / 100
}

/** The ingredient list at a target serving count. A new array — never in place. */
export function scaleIngredients(
  ingredients: readonly RecipeIngredient[],
  from: number,
  to: number,
): RecipeIngredient[] {
  const factor = scaleFactor(from, to)
  return ingredients.map((i) => ({ ...i, quantity: scaleQuantity(i.quantity, i.unit, factor) }))
}

/**
 * "×2", "×0.5", "×1.33" — how the scale is announced. Only ever shown when the
 * factor is not 1, so there is no "×1" case to suppress at every call site.
 */
export function formatFactor(factor: number): string {
  return `×${Math.round(factor * 100) / 100}`
}
