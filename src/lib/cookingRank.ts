// ─────────────────────────────────────────────────────────────────────────
// Cooking-rank presentation (Recipe App Redesign).
//
// The backend exposes cookingRank as a plain integer (UserProfileResponse).
// The redesign's sidebar/profile show it as a titled tier with a progress bar
// toward the next tier — this derives that display shape from the raw number.
// ─────────────────────────────────────────────────────────────────────────

interface RankTier {
  min: number
  title: string
}

/** Ascending tier thresholds; the last tier has no ceiling (progress caps 100). */
const TIERS: RankTier[] = [
  { min: 0, title: 'Kitchen rookie' },
  { min: 2, title: 'Home cook' },
  { min: 5, title: 'Sous-chef' },
  { min: 9, title: 'Head chef' },
  { min: 14, title: 'Master chef' },
]

export interface CookingRankMeta {
  /** The raw rank integer (clamped to >= 0). */
  value: number
  /** The tier title for this rank. */
  title: string
  /** Percentage progress toward the next tier (0–100; 100 at the top tier). */
  progress: number
}

/** Map a raw cookingRank integer to its titled tier + progress-to-next. */
export function cookingRankMeta(rank: number): CookingRankMeta {
  const value = Number.isFinite(rank) && rank > 0 ? Math.floor(rank) : 0

  let tierIndex = 0
  for (let i = 0; i < TIERS.length; i++) {
    if (value >= TIERS[i].min) tierIndex = i
  }
  const tier = TIERS[tierIndex]
  const next = TIERS[tierIndex + 1]

  const progress = next
    ? Math.round(((value - tier.min) / (next.min - tier.min)) * 100)
    : 100

  return { value, title: tier.title, progress: Math.max(0, Math.min(100, progress)) }
}
