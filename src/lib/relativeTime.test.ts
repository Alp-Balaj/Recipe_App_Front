import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relativeTime'

const NOW = Date.parse('2026-07-19T12:00:00Z')

describe('formatRelativeTime', () => {
  it('reports "just now" for very recent times', () => {
    expect(formatRelativeTime('2026-07-19T11:59:40Z', NOW)).toBe('just now')
  })

  it('formats minutes, hours, days, weeks, months and years', () => {
    expect(formatRelativeTime('2026-07-19T11:30:00Z', NOW)).toBe('30 min ago')
    expect(formatRelativeTime('2026-07-19T09:00:00Z', NOW)).toBe('3 hours ago')
    expect(formatRelativeTime('2026-07-18T12:00:00Z', NOW)).toBe('1 day ago')
    expect(formatRelativeTime('2026-07-05T12:00:00Z', NOW)).toBe('2 weeks ago')
    expect(formatRelativeTime('2026-05-19T12:00:00Z', NOW)).toBe('2 mo ago')
    expect(formatRelativeTime('2024-07-19T12:00:00Z', NOW)).toBe('2 years ago')
  })

  it('returns empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('')
  })
})
