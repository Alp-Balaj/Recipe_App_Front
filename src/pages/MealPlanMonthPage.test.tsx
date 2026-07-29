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
      recipe: { id: 'r-shak', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
    },
    {
      id: 'e2',
      dayOfWeek: 'Monday',
      mealType: 'Lunch',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null, totalTimeMinutes: 30 },
    },
    {
      id: 'e3',
      dayOfWeek: 'Tuesday',
      mealType: 'Lunch',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null, totalTimeMinutes: 30 },
    },
    {
      id: 'e4',
      dayOfWeek: 'Thursday',
      mealType: 'Lunch',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null, totalTimeMinutes: 30 },
    },
    {
      id: 'e5',
      dayOfWeek: 'Friday',
      mealType: 'Dinner',
      recipe: { id: 'r-ramen', title: 'Quick ramen', imageUrl: null, totalTimeMinutes: 30 },
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

    // The month stops short of the pane's own 1240px ceiling: past ~1080 a
    // wider row of seven cells is just longer to scan. The cap lives on the
    // page so the pane (and every other wide page) is left alone.
    it('caps the calendar at 1080px inside that column', async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      await screen.findByRole('link', { name: /plan 2026-07-29/i })
      expect(screen.getByTestId('month-canvas')).toHaveStyle({
        maxWidth: '1080px',
        margin: '0px auto',
      })
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

    // Replaced the "×3" repeat warning: five entries drawn from three recipes
    // reads as "3 dishes", which says the same thing without a threshold to
    // fall under. Counted by recipe id, so the three orzo entries are one dish.
    it("counts the week's distinct dishes", async () => {
      stubMonth()
      renderRoute('/plan?m=2026-07')

      const rail = await screen.findByRole('link', { name: /week of 2026-07-27/i })
      await waitFor(() => expect(within(rail).getByText('3 dishes')).toBeInTheDocument())
      expect(within(rail).queryByText(/×3/)).not.toBeInTheDocument()
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

// ─────────────────────────────────────────────────────────────────────────
// The insight strip + back-to-back marks (meal-plan insights, month PR).
//
// These are the only tests here that depend on what day it is, so the clock is
// pinned. Only Date is faked — faking timers too would stall react-query and
// userEvent.
// ─────────────────────────────────────────────────────────────────────────
describe('what the month works out about itself', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-07-29T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = realMatchMedia
  })

  // Only Friday 31 July has a dinner, and the grid ends on Sunday 2 August —
  // so the window is the 5 days it can see, not a 7 it cannot.
  it('prompts with the open dinners it can actually see', async () => {
    stubMonth()
    renderRoute('/plan?m=2026-07')

    const card = await screen.findByRole('region', { name: /dinners ahead/i })
    await waitFor(() => expect(card).toHaveTextContent(/4\s*dinners open in the next 5 days/i))
    expect(within(card).getByRole('link', { name: /start with/i })).toHaveAttribute(
      'href',
      '/plan/2026-07-29',
    )
  })

  it('hides the prompt on a month that does not contain today', async () => {
    stubMonth()
    renderRoute('/plan?m=2026-12')

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /plan 2026-12-01/i })).toBeInTheDocument(),
    )
    expect(screen.queryByRole('region', { name: /dinners ahead/i })).not.toBeInTheDocument()
  })

  // Lemon orzo runs Monday 27 and Tuesday 28 — the mark belongs to Tuesday.
  it('marks a dish carried over from the day before', async () => {
    goDesktop()
    stubMonth()
    renderRoute('/plan?m=2026-07')

    const tuesday = await screen.findByRole('link', { name: /plan 2026-07-28/i })
    await waitFor(() =>
      expect(within(tuesday).getByTitle(/lemon orzo — also the day before/i)).toBeInTheDocument(),
    )

    const monday = screen.getByRole('link', { name: /plan 2026-07-27/i })
    expect(within(monday).queryByTitle(/also the day before/i)).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Calorie ribbon + in-cell cook load. Both read fields that now ride along on
// the entry's recipe summary, so neither costs a request.
// ─────────────────────────────────────────────────────────────────────────
describe('the month cost signals', () => {
  const COUNTED_PLAN: MealPlan = {
    id: PLAN_ID,
    weekStartDate: WEEK_31,
    createdAt: WEEK_31,
    entries: [
      {
        id: 'c1',
        dayOfWeek: 'Monday',
        mealType: 'Breakfast',
        recipe: { id: 'r-oats', title: 'Oats', imageUrl: null, totalTimeMinutes: 10, caloriesPerServing: 300 },
      },
      {
        id: 'c2',
        dayOfWeek: 'Monday',
        mealType: 'Dinner',
        recipe: { id: 'r-ragu', title: 'Ragù', imageUrl: null, totalTimeMinutes: 170, caloriesPerServing: 800 },
      },
      {
        // Tuesday is planned but uncountable — one dish has no figure.
        id: 'c3',
        dayOfWeek: 'Tuesday',
        mealType: 'Dinner',
        recipe: { id: 'r-soup', title: 'Soup', imageUrl: null, totalTimeMinutes: 25, caloriesPerServing: null },
      },
    ],
  }

  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  it('counts only the days it can total, and says how many', () => {
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(COUNTED_PLAN)
    renderRoute('/plan?m=2026-07')

    return waitFor(() => {
      const ribbon = screen.getByRole('region', { name: /daily calories/i })
      // Monday totals; Tuesday is planned but has a dish with no figure.
      expect(ribbon).toHaveTextContent(/from 1 of 2 planned days/i)
    })
  })

  it('says so plainly when no planned dish has a calorie figure', async () => {
    stubMonth() // the shared fixture carries times but no calories
    renderRoute('/plan?m=2026-07')

    const ribbon = await screen.findByRole('region', { name: /daily calories/i })
    await waitFor(() =>
      // The copy uses a typographic apostrophe, so match around it.
      expect(ribbon).toHaveTextContent(/none of this month.s dishes has a calorie figure/i),
    )
  })

  it("marks a day's cook load in its cell", async () => {
    goDesktop()
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(COUNTED_PLAN)
    renderRoute('/plan?m=2026-07')

    // Monday 27 July: 10 + 170 minutes.
    const monday = await screen.findByRole('link', { name: /plan 2026-07-27/i })
    await waitFor(() =>
      expect(within(monday).getByTitle(/3h in the kitchen/i)).toBeInTheDocument(),
    )
  })
})
