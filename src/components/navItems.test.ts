import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, DESKTOP_NAV_ITEMS, activeTab } from './navItems'

describe('nav items', () => {
  // The Plan tab lands on the month calendar (the front door), superseding
  // week/shopping rework Task 9's /plan/week landing. That same reviewed
  // commit also gave the shopping list its own tab instead of sharing Plan's
  // highlight, which still holds below.
  it('sends the Plan tab to the month calendar, not a week', () => {
    const plan = NAV_ITEMS.find((item) => item.id === 'plan')
    expect(plan).toBeDefined()
    expect(plan!.to).toBe('/plan')
  })

  it('gives the shopping list its own tab', () => {
    const shop = NAV_ITEMS.find((item) => item.id === 'shop')
    expect(shop).toBeDefined()
    expect(shop!.to).toBe('/shopping-list')
  })

  it('keeps the Plan and Shop tabs on desktop', () => {
    expect(DESKTOP_NAV_ITEMS.some((item) => item.id === 'plan')).toBe(true)
    expect(DESKTOP_NAV_ITEMS.some((item) => item.id === 'shop')).toBe(true)
  })

  it('lights the shop tab on the shopping list, not the plan tab', () => {
    expect(activeTab('/shopping-list')).toBe('shop')
  })

  it('still lights the plan tab across every plan surface', () => {
    expect(activeTab('/plan')).toBe('plan')
    expect(activeTab('/plan/week/2026-07-27')).toBe('plan')
    expect(activeTab('/plan/2026-07-27')).toBe('plan')
  })

  it('leaves the existing tabs alone', () => {
    expect(activeTab('/feed')).toBe('feed')
    expect(activeTab('/chat')).toBe('chat')
    expect(activeTab('/recipes/123')).toBe('discover')
  })
})
