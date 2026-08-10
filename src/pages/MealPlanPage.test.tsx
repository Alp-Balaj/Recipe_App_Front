import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as planApi from '@/api/mealPlans'
import * as cookLogApi from '@/api/cookLog'
import * as pantry from '@/hooks/usePantryReadiness'
import type { MealPlan, MealPlanSummary } from '@/api/mealPlans'

// ─────────────────────────────────────────────────────────────────────────
// /plan — the redesigned front door.
//
// The clock is frozen to Monday 10 August 2026 so "next up", "TONIGHT" and the
// week range never depend on the machine's date.
// ─────────────────────────────────────────────────────────────────────────

const TODAY = new Date('2026-08-10T09:00:00.000Z')
const WEEK_START = '2026-08-10T00:00:00.000Z'
const PLAN_ID = 'plan-week-33'

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entryCount: 4,
  totalMinutes: 245,
}

const plan: MealPlan = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entries: [
    {
      id: 'e-mon-d',
      dayOfWeek: 'Monday',
      mealType: 'Dinner',
      recipe: { id: 'r-bass', title: 'Sea bass with fennel', imageUrl: null, totalTimeMinutes: 45 },
    },
    {
      id: 'e-mon-b',
      dayOfWeek: 'Monday',
      mealType: 'Breakfast',
      recipe: { id: 'r-oats', title: 'Overnight oats', imageUrl: null, totalTimeMinutes: 10 },
    },
    {
      id: 'e-tue-l',
      dayOfWeek: 'Tuesday',
      mealType: 'Lunch',
      recipe: { id: 'r-halloumi', title: 'Halloumi salad', imageUrl: null, totalTimeMinutes: 20 },
    },
    {
      id: 'e-thu-d',
      dayOfWeek: 'Thursday',
      mealType: 'Dinner',
      recipe: { id: 'r-stew', title: 'Beef stew', imageUrl: null, totalTimeMinutes: 170 },
    },
  ],
}

const realMatchMedia = window.matchMedia

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

function stubPlan(overrides: { plan?: MealPlan | null } = {}) {
  vi.spyOn(planApi, 'getMealPlanForWeek').mockResolvedValue(
    overrides.plan === null ? null : (summary as never),
  )
  vi.spyOn(planApi, 'getMealPlan').mockResolvedValue(overrides.plan ?? plan)
  vi.spyOn(planApi, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
}

function stubCookLog(
  overrides: {
    latest?: cookLogApi.CookLogLatest
    history?: cookLogApi.CookLogListResponse
  } = {},
) {
  vi.spyOn(cookLogApi, 'getLatestCook').mockResolvedValue(
    overrides.latest ?? { latest: null, totalCount: 0 },
  )
  vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue(
    overrides.history ?? { items: [], nextCursor: null },
  )
}

describe('/plan — the planning front door', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(TODAY)
    goDesktop()
  })

  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = realMatchMedia
  })

  it('leads with the next meal from today, in meal order', async () => {
    stubPlan()
    stubCookLog()
    renderRoute('/plan')

    // Monday BREAKFAST, even though Monday dinner is first in the entry array
    // and the array is the order the server happened to return.
    //
    // Scoped to the hero on purpose: the dish is also a chip in the week strip,
    // so an unscoped query matches twice and says nothing about which one led.
    const hero = await screen.findByTestId('next-up-hero')
    expect(within(hero).getByText('Overnight oats')).toBeInTheDocument()
    expect(within(hero).getByText(/NEXT UP · BREAKFAST, TONIGHT/)).toBeInTheDocument()
  })

  it('skips a meal that has already been cooked', async () => {
    stubPlan()
    stubCookLog({
      history: {
        items: [
          {
            id: 'c1',
            recipeId: 'r-oats',
            recipeTitle: 'Overnight oats',
            mealPlanEntryId: 'e-mon-b',
            cookedAt: '2026-08-10T07:30:00.000Z',
            note: null,
            recipeAvailable: true,
          },
        ],
        nextCursor: null,
      },
    })
    renderRoute('/plan')

    // Breakfast is done, so the hero moves on to Monday's dinner.
    expect(await screen.findByText(/NEXT UP · DINNER, TONIGHT/)).toBeInTheDocument()
  })

  it('counts planned slots against the week, not the month', async () => {
    stubPlan()
    stubCookLog()
    renderRoute('/plan')

    // Four entries, 21 slots — and the header and the coverage strip must agree.
    expect(await screen.findByText('4 of 21 planned')).toBeInTheDocument()
    expect(screen.getByText('4 / 21 planned')).toBeInTheDocument()
  })

  it('names the open dinners from today onward', async () => {
    stubPlan()
    stubCookLog()
    renderRoute('/plan')

    // Mon and Thu have dinners; Tue, Wed, Fri, Sat, Sun do not.
    expect(
      await screen.findByText(/5 dinners still open — Tue, Wed, Fri, Sat and Sun/),
    ).toBeInTheDocument()
  })

  // ── the cold-start trap ───────────────────────────────────────────────────

  it('does not claim an empty week while the entries are still loading', async () => {
    // The plan id resolves immediately; its entries never arrive during the
    // assertion. That gap is what MealPlanWeekPage documents: an empty entry
    // list here means "not loaded", not "nothing planned", and telling a user
    // with a full week that they have planned nothing is the bug.
    vi.spyOn(planApi, 'getMealPlanForWeek').mockResolvedValue(summary as never)
    vi.spyOn(planApi, 'getMealPlan').mockReturnValue(new Promise(() => {}) as never)
    vi.spyOn(planApi, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    stubCookLog()

    renderRoute('/plan')

    await screen.findByText(/10 – 16 August/)
    expect(screen.queryByText('Nothing planned yet')).not.toBeInTheDocument()
  })

  it('does say the week is empty once it is known to be', async () => {
    stubPlan({ plan: { ...plan, entries: [] } })
    stubCookLog()
    renderRoute('/plan')

    expect(await screen.findByText('Nothing planned yet')).toBeInTheDocument()
  })

  // ── the pantry seam ───────────────────────────────────────────────────────

  it('renders one full-width column while there is no pantry', async () => {
    stubPlan()
    stubCookLog()
    renderRoute('/plan')

    await screen.findByTestId('next-up-hero')

    // usePantryReadiness returns null today, so the readiness card must not be
    // on the page at all — an empty second column would read as broken.
    expect(screen.queryByText('IN YOUR KITCHEN')).not.toBeInTheDocument()
  })

  it('renders the readiness card in its column as soon as a pantry exists', async () => {
    // This is the whole contract with the session building the pantry:
    // implementing this ONE hook lights the card up, with no page change.
    vi.spyOn(pantry, 'usePantryReadiness').mockReturnValue({
      have: 6,
      needed: 8,
      missing: [
        { name: 'Fennel bulb', quantityLabel: '1 needed' },
        { name: 'Lemon', quantityLabel: '2 needed' },
      ],
      tomorrow: { title: 'Halloumi salad', missingCount: 0 },
    })
    stubPlan()
    stubCookLog()
    renderRoute('/plan')

    expect(await screen.findByText('IN YOUR KITCHEN')).toBeInTheDocument()
    expect(screen.getByText('6 / 8')).toBeInTheDocument()
    expect(screen.getByText('Fennel bulb')).toBeInTheDocument()
    expect(screen.getByText('You have most of tonight — two things short.')).toBeInTheDocument()
    // Never writes — it points at the Shop tab, which owns the problem.
    expect(screen.getByText('Add 2 to shopping list ›')).toHaveAttribute('href', '/shopping-list')
  })

  // ── §3 ────────────────────────────────────────────────────────────────────

  it('offers the last cook to rate, and links to the full history', async () => {
    stubPlan()
    stubCookLog({
      latest: {
        latest: {
          id: 'c9',
          recipeId: 'r-pide',
          recipeTitle: 'Pide with minced lamb',
          mealPlanEntryId: null,
          cookedAt: '2026-08-07T19:00:00.000Z',
          note: null,
          recipeAvailable: true,
        },
        totalCount: 34,
      },
    })
    renderRoute('/plan')

    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByText('All 34 cooks ›')).toHaveAttribute('href', '/plan/cooks')
  })

  it('saves a note without touching the rating when the stars were not moved', async () => {
    const patch = vi
      .spyOn(cookLogApi, 'updateCookNote')
      .mockResolvedValue({} as cookLogApi.CookLogEntry)

    stubPlan()
    stubCookLog({
      latest: {
        latest: {
          id: 'c9',
          recipeId: 'r-pide',
          recipeTitle: 'Pide with minced lamb',
          mealPlanEntryId: null,
          cookedAt: '2026-08-07T19:00:00.000Z',
          note: null,
          recipeAvailable: true,
        },
        totalCount: 1,
      },
    })
    renderRoute('/plan')

    const field = await screen.findByLabelText('Note about this cook')
    await userEvent.type(field, 'dough needs a longer rest')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('c9', 'dough needs a longer rest'),
    )
  })

  it('surfaces a failed save rather than claiming it worked', async () => {
    vi.spyOn(cookLogApi, 'updateCookNote').mockRejectedValue(new Error('nope'))

    stubPlan()
    stubCookLog({
      latest: {
        latest: {
          id: 'c9',
          recipeId: 'r-pide',
          recipeTitle: 'Pide with minced lamb',
          mealPlanEntryId: null,
          cookedAt: '2026-08-07T19:00:00.000Z',
          note: null,
          recipeAvailable: true,
        },
        totalCount: 1,
      },
    })
    renderRoute('/plan')

    const field = await screen.findByLabelText('Note about this cook')
    await userEvent.type(field, 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t save that/)
    expect(screen.queryByText('Saved.')).not.toBeInTheDocument()
  })

  it('shows the repeated meal on the strip after "Cook it again"', async () => {
    // Asserted on the SCREEN, not on a call count: repeatOnNextOpenSlot fetches
    // the plan itself to find a free slot, so counting getMealPlan calls passes
    // whether or not the caches are ever invalidated — the test would pin
    // nothing. What matters is that the strip stops showing the stale week.
    let placed = false
    vi.spyOn(planApi, 'addMealPlanEntry').mockImplementation(async () => {
      placed = true
      return {} as never
    })
    vi.spyOn(planApi, 'getMealPlan').mockImplementation(async () =>
      placed
        ? {
            ...plan,
            entries: [
              ...plan.entries,
              {
                id: 'e-tue-d',
                dayOfWeek: 'Tuesday' as const,
                mealType: 'Dinner' as const,
                recipe: {
                  id: 'r-pide',
                  title: 'Pide with minced lamb',
                  imageUrl: null,
                  totalTimeMinutes: 60,
                },
              },
            ],
          }
        : plan,
    )
    vi.spyOn(planApi, 'getMealPlanForWeek').mockResolvedValue(summary as never)
    vi.spyOn(planApi, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    stubCookLog({
      latest: {
        latest: {
          id: 'c9',
          recipeId: 'r-pide',
          recipeTitle: 'Pide with minced lamb',
          mealPlanEntryId: null,
          cookedAt: '2026-08-07T19:00:00.000Z',
          note: null,
          recipeAvailable: true,
        },
        totalCount: 1,
      },
    })

    renderRoute('/plan')
    // Only the §3 card names the dish before the repeat.
    await screen.findByText('Pide with minced lamb')
    expect(screen.getAllByText('Pide with minced lamb')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cook it again ›' }))

    // The dish is placed server-side; without invalidating the plan caches it
    // stays invisible until a reload, and the strip, the coverage figures and
    // the hero all keep reading the stale week. Two mentions = the card and the
    // new chip.
    await waitFor(() =>
      expect(screen.getAllByText('Pide with minced lamb').length).toBeGreaterThan(1),
    )
  })

  // ── the month calendar is not gone ────────────────────────────────────────

  it('still renders the month calendar behind ?m=', async () => {
    stubPlan()
    stubCookLog()
    renderRoute('/plan?m=2026-08')

    // The month page's own heading, not the front door's week range.
    expect(await screen.findByText('August 2026')).toBeInTheDocument()
    expect(screen.queryByText(/NEXT UP/)).not.toBeInTheDocument()
  })

  it('falls back to the month calendar below 1024px', async () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia

    stubPlan()
    stubCookLog()
    renderRoute('/plan')

    expect(await screen.findByText('August 2026')).toBeInTheDocument()
  })
})
