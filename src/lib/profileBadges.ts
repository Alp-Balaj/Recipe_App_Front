// ─────────────────────────────────────────────────────────────────────────
// Profile badges (Recipe App Redesign).
//
// The design's gamified "Badges" grid has no backend endpoint. Rather than
// invent fake awards, we DERIVE each badge's earned/locked state from the real
// UserProfileResponse counters (recipeCount / followerCount / followingCount /
// cookingRank). The derivation is deterministic and honest: a locked badge
// simply hasn't hit its threshold yet.
// ─────────────────────────────────────────────────────────────────────────

export interface ProfileBadge {
  id: string
  /** Emoji/glyph shown in the badge tile. */
  icon: string
  name: string
  /** One-line "how to earn it" description. */
  desc: string
  earned: boolean
}

/** Real counters the badges are derived from. */
export interface BadgeStats {
  recipeCount: number
  followerCount: number
  followingCount: number
  cookingRank: number
}

/**
 * Derive the six-badge grid from real profile counters. Order is stable so the
 * grid never reshuffles; earned/locked flips purely on the thresholds.
 */
export function deriveBadges(stats: BadgeStats): ProfileBadge[] {
  const { recipeCount, followerCount, followingCount, cookingRank } = stats
  return [
    {
      id: 'first-recipe',
      icon: '🍳',
      name: 'First cook',
      desc: 'Publish your first recipe',
      earned: recipeCount >= 1,
    },
    {
      id: 'recipe-shelf',
      icon: '📚',
      name: 'Recipe shelf',
      desc: 'Publish 10 recipes',
      earned: recipeCount >= 10,
    },
    {
      id: 'getting-noticed',
      icon: '🌱',
      name: 'Getting noticed',
      desc: 'Gain your first follower',
      earned: followerCount >= 1,
    },
    {
      id: 'rising-star',
      icon: '⭐',
      name: 'Rising star',
      desc: 'Reach 10 followers',
      earned: followerCount >= 10,
    },
    {
      id: 'sous-chef',
      icon: '✦',
      name: 'Sous-chef',
      desc: 'Reach cooking rank 5',
      earned: cookingRank >= 5,
    },
    {
      id: 'social-cook',
      icon: '👥',
      name: 'Social cook',
      desc: 'Follow 5 other cooks',
      earned: followingCount >= 5,
    },
  ]
}

/** How many of the derived badges are earned. */
export function earnedBadgeCount(badges: ProfileBadge[]): number {
  return badges.reduce((n, b) => n + (b.earned ? 1 : 0), 0)
}
