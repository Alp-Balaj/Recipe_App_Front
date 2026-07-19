import { describe, expect, it } from 'vitest'
import { deriveBadges, earnedBadgeCount } from './profileBadges'

describe('deriveBadges', () => {
  it('locks everything for a brand-new account', () => {
    const badges = deriveBadges({ recipeCount: 0, followerCount: 0, followingCount: 0, cookingRank: 0 })
    expect(badges).toHaveLength(6)
    expect(earnedBadgeCount(badges)).toBe(0)
  })

  it('earns badges as the real counters cross their thresholds', () => {
    const badges = deriveBadges({ recipeCount: 12, followerCount: 3, followingCount: 6, cookingRank: 200 })
    const earned = new Set(badges.filter((b) => b.earned).map((b) => b.id))
    // recipeCount 12 → first-recipe + recipe-shelf; followerCount 3 → getting-noticed;
    // followingCount 6 → social-cook; cookingRank 200 pts → sous-chef. rising-star (≥10 followers) locked.
    expect(earned).toEqual(new Set(['first-recipe', 'recipe-shelf', 'getting-noticed', 'sous-chef', 'social-cook']))
    expect(earned.has('rising-star')).toBe(false)
    expect(earnedBadgeCount(badges)).toBe(5)
  })

  it('keeps a stable order regardless of earned state', () => {
    const a = deriveBadges({ recipeCount: 0, followerCount: 0, followingCount: 0, cookingRank: 0 })
    const b = deriveBadges({ recipeCount: 99, followerCount: 99, followingCount: 99, cookingRank: 99 })
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
  })
})
