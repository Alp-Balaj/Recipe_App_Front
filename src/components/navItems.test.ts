import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, DESKTOP_NAV_ITEMS, activeTab } from './navItems'

describe('nav items', () => {
  it('includes a Plan tab pointing at /plan', () => {
    const plan = NAV_ITEMS.find((item) => item.id === 'plan')
    expect(plan).toBeDefined()
    expect(plan!.to).toBe('/plan')
  })

  it('keeps the Plan tab on desktop', () => {
    expect(DESKTOP_NAV_ITEMS.some((item) => item.id === 'plan')).toBe(true)
  })

  it('lights the Plan tab on both plan surfaces', () => {
    expect(activeTab('/plan')).toBe('plan')
    expect(activeTab('/shopping-list')).toBe('plan')
  })

  it('leaves the existing tabs alone', () => {
    expect(activeTab('/feed')).toBe('feed')
    expect(activeTab('/chat')).toBe('chat')
    expect(activeTab('/recipes/123')).toBe('discover')
  })
})
