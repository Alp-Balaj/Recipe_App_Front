// ─────────────────────────────────────────────────────────────────────────
// Cooking-rank presentation (Recipe App Redesign).
//
// The backend exposes cookingRank as a POINTS score (UserProfileResponse) —
// actions award points (RecipeCreated +20, RecipeReceivedLike +5, …) and the
// tier is a band on that score. The redesign's sidebar/profile show it as a
// titled tier with a progress bar toward the next tier — this derives that
// display shape from the raw points.
//
// The thresholds and titles below MIRROR the backend's Domain/Enums/CookingTier
// (Novice 0–199 · HomeCook 200–499 · Intermediate 500–999 · Skilled 1000–1799 ·
// Expert 1800–2799 · Chef 2800+). Keep the two in sync — if the backend rebands,
// update this table to match.
// ─────────────────────────────────────────────────────────────────────────

interface RankTier {
  min: number
  title: string
}

/** Ascending tier thresholds (points); the last tier has no ceiling (progress caps 100). */
const TIERS: RankTier[] = [
  { min: 0, title: 'Novice' },
  { min: 200, title: 'Home cook' },
  { min: 500, title: 'Intermediate' },
  { min: 1000, title: 'Skilled' },
  { min: 1800, title: 'Expert' },
  { min: 2800, title: 'Chef' },
]

export interface CookingRankMeta {
  /** The raw points score (clamped to >= 0). */
  value: number
  /** The tier title for this score. */
  title: string
  /** Percentage progress toward the next tier (0–100; 100 at the top tier). */
  progress: number
  /** The next tier's title, or undefined at the top tier. */
  nextTitle?: string
  /** Points remaining to reach the next tier, or undefined at the top tier. */
  pointsToNext?: number
}

/** Map a raw cookingRank points score to its titled tier + progress-to-next. */
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

  return {
    value,
    title: tier.title,
    progress: Math.max(0, Math.min(100, progress)),
    nextTitle: next?.title,
    pointsToNext: next ? Math.max(0, next.min - value) : undefined,
  }
}
