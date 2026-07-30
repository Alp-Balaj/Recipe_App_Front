import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { MealPlan, MealPlanEntry, MealPlanSummary } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'

// ─────────────────────────────────────────────────────────────────────────
// The week board (/plan/week/:start) — week/shopping rework, Task 8.
//
// Mocked through MSW rather than module spies, so the plan lookup runs the real
// getMealPlanForWeek → GET /meal-plans?weekStart=… round trip: the board's whole
// job is judging ONE week, and a lookup that asked for the wrong one is exactly
// the failure worth catching.
//
// ── Pinned clock ────────────────────────────────────────────────────────────
// Every fixture below is the week of Mon 27 July 2026, and the board marks
// today's row. Thirteen tests on this branch already time-bombed by hard-coding
// that week as "now" and then being run after it (see MealPlanDayPage.test.tsx's
// note), so "now" is pinned to the fixture's own Thursday instead of trusting
// whenever the suite happens to run.
// ─────────────────────────────────────────────────────────────────────────

const WEEK_START = '2026-07-27T00:00:00.000Z' // the Monday
const PLAN_ID = 'plan-week-1'
const NOW = new Date('2026-07-30T09:00:00.000Z') // the Thursday of that week

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entryCount: 5,
  totalMinutes: 250,
}

function entry(
  id: string,
  dayOfWeek: MealPlanEntry['dayOfWeek'],
  mealType: MealPlanEntry['mealType'],
  recipe: MealPlanEntry['recipe'],
): MealPlanEntry {
  return { id, dayOfWeek, mealType, recipe }
}

const oats = { id: 'recipe-oats', title: 'Overnight oats', imageUrl: null, totalTimeMinutes: 5, caloriesPerServing: 300 }
const pasta = { id: 'recipe-pasta', title: 'Pasta al forno', imageUrl: null, totalTimeMinutes: 45, caloriesPerServing: 700 }
const lamb = { id: 'recipe-lamb', title: 'Slow lamb ragu', imageUrl: null, totalTimeMinutes: 90, caloriesPerServing: 900 }
// No calorie figure — the day it lands on must read "not counted", never a
// smaller number, and never a hole.
const corn = { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null, totalTimeMinutes: 20, caloriesPerServing: null }

/**
 * Monday 45m / Tuesday 20m uncounted / Thursday 140m fully counted / Sunday 45m.
 * Wednesday, Friday and Saturday are empty on purpose: seven rows either way.
 * Average over the four PLANNED days is 62.5m, so Thursday is 2.2× the week.
 */
const entries: MealPlanEntry[] = [
  entry('entry-mon-dinner', 'Monday', 'Dinner', pasta),
  entry('entry-tue-lunch', 'Tuesday', 'Lunch', corn),
  entry('entry-thu-breakfast', 'Thursday', 'Breakfast', oats),
  entry('entry-thu-lunch', 'Thursday', 'Lunch', pasta),
  entry('entry-thu-dinner', 'Thursday', 'Dinner', lamb),
  entry('entry-sun-dinner', 'Sunday', 'Dinner', pasta),
]

const plan: MealPlan = { id: PLAN_ID, weekStartDate: WEEK_START, createdAt: WEEK_START, entries }

const insight = {
  distinctIngredientCount: 23,
  sharedIngredientCount: 6,
  outlier: { recipeId: 'recipe-lamb', title: 'Slow lamb ragu', uniqueIngredientCount: 9 },
}

function makeRecipe(over: Partial<RecipeResponse> & Pick<RecipeResponse, 'id' | 'title'>): RecipeResponse {
  return {
    description: '',
    prepTimeMinutes: 15,
    cookTimeMinutes: 30,
    totalTimeMinutes: 45,
    servings: 4,
    difficulty: 'Medium',
    cuisineType: null,
    caloriesPerServing: 700,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [
      { name: 'Rigatoni', quantity: 500, unit: 'g' },
      { name: 'Tomato passata', quantity: 700, unit: 'g' },
    ],
    steps: [],
    tags: [],
    createdByUserId: '11111111-1111-1111-1111-111111111111',
    ...over,
  }
}

/** Plan lookup + detail + insight + the panel's recipe, all as real requests. */
function plannedWeek(opts: { details?: MealPlan[]; onDelete?: (planId: string, entryId: string) => void } = {}) {
  const queue = [...(opts.details ?? [])]
  return [
    http.get('/api/meal-plans', () => HttpResponse.json({ items: [summary], nextCursor: null })),
    http.get('/api/meal-plans/:id', () => HttpResponse.json(queue.length > 1 ? queue.shift()! : (queue[0] ?? plan))),
    http.get('/api/meal-plans/:id/grocery-insight', () => HttpResponse.json(insight)),
    http.delete('/api/meal-plans/:id/entries/:entryId', ({ params }) => {
      opts.onDelete?.(String(params.id), String(params.entryId))
      return new HttpResponse(null, { status: 204 })
    }),
    http.get('/api/recipes/:id', ({ params }) =>
      HttpResponse.json(makeRecipe({ id: String(params.id), title: 'Pasta al forno' })),
    ),
  ]
}

/** The seven rows, in Monday-first order — awaits the board resolving. */
async function rows() {
  const list = await screen.findByRole('list', { name: /day by day/i })
  return within(list).getAllByRole('listitem')
}

/** One day's row. Await `rows()` first — the board renders once the plan resolves. */
function row(dayName: string) {
  return screen.getByTestId(`week-day-${dayName}`)
}

beforeEach(() => vi.setSystemTime(NOW))
afterAll(() => vi.useRealTimers())

describe('the week board', () => {
  it('renders seven day rows for an unplanned week and offers no create action', async () => {
    server.use(http.get('/api/meal-plans', () => HttpResponse.json({ items: [], nextCursor: null })))

    renderRoute('/plan/week/2026-07-27')

    expect(await screen.findByText('Mon 27')).toBeInTheDocument()
    expect(screen.getByText('Sun 2')).toBeInTheDocument()
    expect(await rows()).toHaveLength(7)

    // The cold start the day page already abolished: a plan comes into existence
    // when a MEAL is planned, so there is nothing here to press.
    expect(screen.queryByRole('button', { name: /start this week/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /plan this week/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate|create|new plan/i })).not.toBeInTheDocument()
    // An unplanned week is not a week of zero cooking — it says nothing instead.
    expect(screen.queryByText('0m')).not.toBeInTheDocument()
  })

  it("puts each day's effort on that day's row", async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')
    await rows()

    // 5 + 45 + 90 on Thursday, and Thursday only.
    expect(await within(row('Thursday')).findByText('140m')).toBeInTheDocument()
    expect(within(row('Monday')).getByText('45m')).toBeInTheDocument()
    expect(within(row('Monday')).queryByText('140m')).not.toBeInTheDocument()
    expect(within(row('Tuesday')).getByText('20m')).toBeInTheDocument()
    // Nothing planned is not 0m.
    expect(within(row('Wednesday')).queryByText(/\dm$/)).not.toBeInTheDocument()
  })

  it("reads effort against the week's own average", async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')
    await rows()

    // 140 / 62.5 — legible without a second chart, because the comparison is
    // stated on the row rather than drawn in a footer.
    expect(await within(row('Thursday')).findByText(/2\.2× average/i)).toBeInTheDocument()
    expect(within(row('Monday')).queryByText(/× average/i)).not.toBeInTheDocument()
  })

  it('marks a partly-counted day as not counted rather than showing a low number', async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')
    await rows()

    const tuesday = within(row('Tuesday'))
    expect(await tuesday.findByText(/not counted/i)).toBeInTheDocument()
    // Not a hole and NOT a zero: a short bar reads as a light day, and a day
    // whose lunch merely has no figure is not a light day.
    expect(tuesday.queryByText('0')).not.toBeInTheDocument()
    expect(tuesday.queryByText(/kcal/i)).not.toBeInTheDocument()
  })

  it('labels every calorie figure as planned', async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')
    await rows()

    const thursday = within(row('Thursday'))
    // 300 + 700 + 900; the thousands separator is locale-dependent.
    expect(await thursday.findByText(/1[,.\s]?900/)).toBeInTheDocument()
    expect(thursday.getByText(/planned/i)).toBeInTheDocument()
    // A planner, not a tracker — nothing here claims to know what was eaten.
    expect(screen.queryByText(/\beaten\b|\bate\b/i)).not.toBeInTheDocument()
  })

  it('marks today, so the judgment is anchored to where you are in the week', async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')
    await rows()

    expect(within(row('Thursday')).getByText(/today/i)).toBeInTheDocument()
    expect(within(row('Monday')).queryByText(/today/i)).not.toBeInTheDocument()
  })

  it('opens a panel with remove, and no picker, when a meal is tapped', async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')

    await userEvent.click(
      await screen.findByRole('button', { name: /pasta al forno, thursday lunch/i }),
    )

    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByRole('button', { name: /remove/i })).toBeInTheDocument()
    // The week judges, it does not edit: no picker, no search, no swap.
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
    expect(within(panel).queryByRole('button', { name: /swap|add/i })).not.toBeInTheDocument()

    // What the panel is FOR: the dish's own evidence, and the two ways out.
    expect(await within(panel).findByText('Rigatoni')).toBeInTheDocument()
    expect(within(panel).getByText(/medium/i)).toBeInTheDocument()
    expect(within(panel).getByText(/planned/i)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /open recipe/i })).toHaveAttribute(
      'href',
      '/recipes/recipe-pasta',
    )
    expect(within(panel).getByRole('link', { name: /go to this day/i })).toHaveAttribute(
      'href',
      '/plan/2026-07-30',
    )
  })

  it('closes the panel when its entry disappears', async () => {
    const deleted: string[] = []
    const withoutThursdayLunch: MealPlan = {
      ...plan,
      entries: entries.filter((e) => e.id !== 'entry-thu-lunch'),
    }
    server.use(
      ...plannedWeek({
        details: [plan, withoutThursdayLunch],
        onDelete: (_planId, entryId) => deleted.push(entryId),
      }),
    )
    // PRODUCTION's staleTime (src/main.tsx), not the test default of 0: on the
    // default client the detail is stale the moment it lands, so ANY re-render
    // would refetch it and this case could pass without the mutation
    // invalidating anything at all.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } },
    })

    renderRoute('/plan/week/2026-07-27', { client })

    await userEvent.click(
      await screen.findByRole('button', { name: /pasta al forno, thursday lunch/i }),
    )
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(deleted).toEqual(['entry-thu-lunch']))
    // The panel must not be left describing a meal that no longer exists.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByText('Mon 27')).toBeInTheDocument()
    // And the row it came from lost its lunch: 140m → 95m.
    await waitFor(() => expect(within(row('Thursday')).getByText('95m')).toBeInTheDocument())
  })

  it('names the outlier dish neutrally and links to the shopping list', async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')

    const footer = await screen.findByRole('region', { name: /what this week costs/i })
    expect(await within(footer).findByText(/9 ingredients/i)).toBeInTheDocument()
    expect(within(footer).getByText(/Slow lamb ragu/)).toBeInTheDocument()
    // The size line composes a big figure with its sentence, so it is asserted
    // on the footer's whole text rather than on one element's own text nodes.
    expect(footer).toHaveTextContent(/23 ingredients this week/i)
    expect(within(footer).getByText(/6 of them/i)).toBeInTheDocument()
    // A balance view, not a scold.
    expect(screen.queryByText(/expensive|too much|cut this/i)).not.toBeInTheDocument()
    expect(within(footer).getByRole('link', { name: /shopping list/i })).toHaveAttribute(
      'href',
      '/shopping-list',
    )
  })

  it('mentions a repeated dinner once, at the bottom', async () => {
    server.use(...plannedWeek())

    renderRoute('/plan/week/2026-07-27')

    const footer = await screen.findByRole('region', { name: /what this week costs/i })
    expect(await within(footer).findByText(/pasta al forno/i)).toBeInTheDocument()
    expect(within(footer).getByText(/twice/i)).toBeInTheDocument()
  })

  /**
   * The setup stub answers `matches: false` to everything, so every other case
   * above exercises the SHEET. The dock is the branch the brief actually
   * specifies for desktop, and it is otherwise unreachable under test.
   */
  it('docks the panel beside the rows on a wide screen instead of over them', async () => {
    const original = window.matchMedia
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('1024'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList) as typeof window.matchMedia
    try {
      server.use(...plannedWeek())

      renderRoute('/plan/week/2026-07-27')

      await userEvent.click(
        await screen.findByRole('button', { name: /pasta al forno, thursday lunch/i }),
      )

      const dock = await screen.findByRole('complementary', { name: /the meal you tapped/i })
      expect(within(dock).getByRole('button', { name: /remove/i })).toBeInTheDocument()
      // Docked, not overlaid: the week stays judgeable while you read one dish.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(within(dock).getByText(/planned kcal/i)).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })

  it('asks for the week in the URL, not the current one', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/meal-plans', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('weekStart') ?? '')
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )

    renderRoute('/plan/week/2026-08-10')

    await screen.findByText('Mon 10')
    expect(asked).toEqual(['2026-08-10T00:00:00.000Z'])
  })
})
