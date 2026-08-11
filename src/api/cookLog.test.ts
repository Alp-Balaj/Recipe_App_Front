import { afterEach, describe, expect, it } from 'vitest'
import { middayUtc } from '@/api/cookLog'

// KAN-6. The one function standing between "the day the user tapped" and "the
// day the server records", and the only place in the client where a timezone bug
// would be silent: every wrong answer here is still a valid ISO timestamp, one
// day off, for readers in one half of the world only.

const originalTz = process.env.TZ

describe('middayUtc', () => {
  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('puts the chosen day at midday UTC', () => {
    expect(middayUtc('2026-03-05')).toBe('2026-03-05T12:00:00.000Z')
  })

  // The two timezones the naive implementations break in, and they break in
  // opposite directions — which is why one of them alone is not a test.
  //
  //   new Date('2026-03-05').toISOString()   → midnight UTC. Fine here, but a
  //     server that read it in local time would file it a day early for the east.
  //   new Date(2026, 2, 5).toISOString()     → midnight LOCAL. In Kiritimati
  //     (UTC+14) that is 2026-03-04T10:00Z — the day BEFORE the user picked.
  //
  // middayUtc is built entirely from Date.UTC, so the host's zone cannot reach
  // it. These cases fail loudly the moment someone "simplifies" that away.
  it.each(['Pacific/Kiritimati', 'Pacific/Midway', 'Europe/Istanbul', 'UTC'])(
    'gives the same instant in %s',
    (tz) => {
      process.env.TZ = tz
      expect(middayUtc('2026-03-05')).toBe('2026-03-05T12:00:00.000Z')
    },
  )

  it('keeps single-digit months and days', () => {
    // The zero-padding path: '2026-01-09' must not become month 0 or day 9 of
    // some other month via a stray parseInt radix or a dropped leading zero.
    expect(middayUtc('2026-01-09')).toBe('2026-01-09T12:00:00.000Z')
  })
})
