import { afterAll, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderRoute } from '@/test/utils'
import { planWeekPath, todayPlanDate } from '@/lib/planDates'

// week/shopping rework, Task 9 — /plan/week is the Plan tab's static landing
// path. It has no board of its own: it resolves today's week and redirects to
// the dated /plan/week/:start route, which is what lets the nav point at a
// fixed URL even though "the current week" moves every Monday.
//
// Pinned clock, same reasoning as MealPlanWeekPage.test.tsx: hard-coding
// "today" already time-bombed 13 tests on this branch once.
const NOW = new Date('2026-07-30T09:00:00.000Z') // a Thursday

afterAll(() => vi.useRealTimers())

describe('PlanWeekIndex', () => {
  it('redirects /plan/week to the current week board', async () => {
    vi.setSystemTime(NOW)

    const router = renderRoute('/plan/week')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(planWeekPath(todayPlanDate()))
    })
  })
})
