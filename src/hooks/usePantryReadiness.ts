// ─────────────────────────────────────────────────────────────────────────
// "In your kitchen" — the seam the pantry plugs into.
//
// /plan's readiness card (design handoff §2b) is BUILT: KitchenReadinessCard
// renders the whole thing — progress track, sentence, missing rows, tomorrow
// line, shopping-list action. What does not exist yet is a pantry to derive the
// figures from. There is no Pantry table in the backend and no client state
// holding one; POST /scan/pantry matches a photo and deliberately persists
// nothing.
//
// So this hook is the whole gap, on purpose. It returns null, the page renders
// a full-width hero, and the card sits unused but tested. When the pantry lands
// (roadmap spec 3), implementing THIS FUNCTION lights the card up in its
// designed column — no page change, no component change.
//
// What the implementation owes the card:
//   - `have` / `needed` counted over TODAY's planned dishes' structured
//     ingredients, against pantry stock. `needed` is the denominator the
//     progress track and the "6 / 8" figure both read, so it must count every
//     ingredient, not only the missing ones.
//   - `missing` in the order they should be read — the card renders them as
//     given and does not sort.
//   - `tomorrow` is ONE line or nothing. The handoff is explicit that this page
//     covers today and tomorrow only; the Shop tab owns the full problem.
//
// Two rules inherited from the shopping work that this must not break:
//   - Never claim sufficiency the data cannot support. A dish whose ingredients
//     are unstructured is not "in stock" — leave it out of both counts rather
//     than counting it as had, the same way dayCalories refuses to report a
//     partly-counted day as a smaller number.
//   - The card never writes. Its action links to /shopping-list; the shop
//     projection derives items from the plan.
// ─────────────────────────────────────────────────────────────────────────

export interface MissingIngredient {
  /** Display name, already resolved — the card renders it verbatim. */
  name: string
  /** "1 needed", "2 needed" — the whole right-hand label, pre-formatted. */
  quantityLabel: string
}

export interface TomorrowReadiness {
  /** The dish the line names. */
  title: string
  /** How many of tomorrow's ingredients are missing; 0 renders the ✓ state. */
  missingCount: number
}

export interface PantryReadiness {
  have: number
  needed: number
  missing: MissingIngredient[]
  tomorrow: TomorrowReadiness | null
}

/**
 * Today's readiness against the pantry, or null when there is no pantry to ask.
 *
 * Null is not an error and not a loading state — it means the feature does not
 * exist yet. The page treats it as "render the hero full width".
 */
export function usePantryReadiness(): PantryReadiness | null {
  return null
}
