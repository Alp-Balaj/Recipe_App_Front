import { describe, expect, it } from 'vitest'
import { formatCookTime } from './MonthGrid'

// A week of 21 meals can run past ten hours, so the format has to stay legible
// across three orders of magnitude — that range is what these cases pin.
describe('formatCookTime', () => {
  it('keeps sub-hour durations in bare minutes', () => {
    expect(formatCookTime(0)).toBe('0m')
    expect(formatCookTime(45)).toBe('45m')
    expect(formatCookTime(59)).toBe('59m')
  })

  it('drops the minute part when a duration lands on the hour', () => {
    expect(formatCookTime(60)).toBe('1h')
    expect(formatCookTime(180)).toBe('3h')
  })

  it('carries the remainder otherwise', () => {
    expect(formatCookTime(61)).toBe('1h 1m')
    expect(formatCookTime(155)).toBe('2h 35m')
  })

  it('stays readable at a full week of cooking', () => {
    // 21 slots × ~40 minutes — the top of the realistic range.
    expect(formatCookTime(840)).toBe('14h')
    expect(formatCookTime(845)).toBe('14h 5m')
  })
})
