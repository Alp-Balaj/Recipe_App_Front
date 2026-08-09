import { describe, expect, it } from 'vitest'
import { weekRangeShortOf } from './planDates'

// The week strip's range label. Built from day numbers plus shortMonthOf rather
// than a locale range format, so the ORDER of the parts is ours and only the
// month abbreviation is the platform's — a locale that writes "Aug 3" would
// otherwise reorder the label out from under these assertions.
describe('weekRangeShortOf', () => {
  it('names the month once when the week sits inside one', () => {
    expect(weekRangeShortOf(new Date(Date.UTC(2026, 7, 3)))).toBe('3 – 9 Aug')
  })

  it('names both months when the week straddles two', () => {
    expect(weekRangeShortOf(new Date(Date.UTC(2026, 6, 27)))).toBe('27 Jul – 2 Aug')
  })

  it('handles a week that straddles the new year', () => {
    expect(weekRangeShortOf(new Date(Date.UTC(2026, 11, 28)))).toBe('28 Dec – 3 Jan')
  })
})
