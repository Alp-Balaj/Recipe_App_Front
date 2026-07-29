import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as api from '@/api/mealPlans'
import type { MealPlan, MealPlanSummary } from '@/api/mealPlans'

// July 2026 starts on a Wednesday, so the Monday-first grid leads with 29–30
// June and runs five rows. Every test pins ?m=2026-07 so the month never
// depends on the machine's clock.
const WEEK_31 = '2026-07-27T00:00:00.000Z'
const PLAN_ID = 'plan-week-31'

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_31,
  createdAt: WEEK_31,
  entryCount: 5,
  totalMinutes: 155,
}

/** Lemon orzo three times in one week — exactly what the rail should flag. */
const plan: MealPlan = {
  id: PLAN_ID,
  weekStartDate: WEEK_31,
  createdAt: WEEK_31,
  entries: [
    {
      id: 'e1',
      dayOfWeek: 'Wednesday',
      mealType: 'Breakfast',
      recipe: { id: 'r-shak', title: 'Shakshuka', imageUrl: null },
    },
    {
      id: 'e2',
      dayOfWeek: 'Monday',
      mealType: 'Lunch',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null },
    },
    {
      id: 'e3',
      dayOfWeek: 'Tuesday',
      mealType: 'Lunch',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null },
    },
    {
      id: 'e4',
      dayOfWeek: 'Thursday',
      mealType: 'Lunch',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null },
    },
    {
      id: 'e5',
      dayOfWeek: 'Friday',
      mealType: 'Dinner',
      recipe: { id: 'r-ramen', title: 'Quick ramen', imageUrl: null },
    },
  ],
}

function stubMonth() {
  vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
  vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
}

const realMatchMedia = window.matchMedia

/** Flip useMediaQuery to the ≥1024px branch — chips and the week rail. */
function goDesktop() {
  window.matchMedia = ((query: string) =>
    ({
      matches: /min-width:\s*1024px/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia
}

describe('the month view', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  // Below 1024px a cell is ~38px wide, so dish names are dropped rather than
  // truncated into uselessness — three dots carry the same coverage.
  it('drops to dots on a narrow screen instead of unreadable chips', async () => {
    stubMonth()
    renderRoute('/plan?m=2026-07')

    const cell = await screen.findByRole('link', { name: /plan 2026-07-29/i })
    await waitFor(() => expect(screen.getByText(/5 of 105 slots planned/i)).toBeInTheDocument())
    expect(within(cell).queryByText('Shakshuka')).not.toBeInTheDocument()
    expect(within(cell).getByText('29')).toBeInTheDocument()
  })

  it('sends each day to its own day page', async () => {
    stubMonth()
    renderRoute('/plan?m=2026-07')

    const cell = await screen.findByRole('link', { name: /plan 2026-07-29/i })
    expect(cell).toHaveAttribute('href', '/plan/2026-07-29')
  })

  it('totals the month in its header', async () => {
    stubMonth()
    renderRoute('/plan?m=2026-07')

    // Five rows × 21 slots, five of them planned.
    await waitFor(() => expect(screen.getByText(/5 of 105 slots planned/i)).toBeInTheDocument())
  })

  it('steps to the next month through the URL', async () => {
    stubMonth()
    const user = userEvent.setup()
    const router = renderRoute('/plan?m=2026-07')

    await user.click(await screen.findByRole('button', { name: /aug ›/i }))

    await waitFor(() => expect(router.state.location.search).toBe('?m=2026-08'))
  })

  describe('on desktop', () => {
    beforeEach(() => goDesktop())

    // Seven columns plus the week rail don't fit the 720px reading column:
    // each cell lands at ~82px, too narrow for a dish name to survive as a
    // chip. The shell's wide-page rule (AppShell.isWidePage) is what buys the
    // room, so it's asserted here rather than in the grid's own tests.
    it('takes the wide desktop column, not the 720px reading column', async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      await screen.findByRole('link', { name: /plan 2026-07-29/i })
      expect(document.querySelector('.conversation-inner')).toHaveStyle({ maxWidth: '1240px' })
    })

    it('lays the month out Monday-first, with a column for the week', async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      await waitFor(() => expect(screen.getByText('Mon')).toBeInTheDocument())
      for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Week']) {
        expect(screen.getByText(day)).toBeInTheDocument()
      }
    })

    it("names the week's dishes in the day cells", async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      const cell = await screen.findByRole('link', { name: /plan 2026-07-29/i })
      await waitFor(() => expect(within(cell).getByText('Shakshuka')).toBeInTheDocument())
    })

    it('summarises each row as the week it already is', async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      const rail = await screen.findByRole('link', { name: /week of 2026-07-27/i })
      await waitFor(() => expect(within(rail).getByText('5/21')).toBeInTheDocument())
      expect(rail).toHaveAttribute('href', '/plan/week/2026-07-27')
    })

    it('flags a dish planned three times in one week', async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      const rail = await screen.findByRole('link', { name: /week of 2026-07-27/i })
      await waitFor(() => expect(within(rail).getByText(/lemon ×3/i)).toBeInTheDocument())
    })

    // totalMinutes rides along on the plan summary (backend 849595b) — no
    // per-recipe fetch. 155 minutes reads as "2h 35m", not "155m".
    it("shows the week's cook load beside its coverage", async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      const rail = await screen.findByRole('link', { name: /week of 2026-07-27/i })
      await waitFor(() => expect(within(rail).getByText('2h 35m')).toBeInTheDocument())
    })

    it('leaves a week with no plan showing nothing planned', async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      const rail = await screen.findByRole('link', { name: /week of 2026-07-06/i })
      expect(within(rail).getByText('0/21')).toBeInTheDocument()
      // An empty week reads as empty — no "0m" line claiming a cook time.
      expect(within(rail).queryByText(/\d+m$|\dh/)).not.toBeInTheDocument()
    })
  })
})
