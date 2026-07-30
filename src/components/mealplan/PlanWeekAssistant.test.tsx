import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { MealPlan, MealPlanEntry, MealPlanSummary, WeekProposal } from '@/api/mealPlans'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'

// ─────────────────────────────────────────────────────────────────────────
// The AI week-proposal flow on the week board (stream C, D2 = propose-then-
// accept). MSW throughout, like MealPlanWeekPage.test.tsx: the flow's whole
// point is WHICH requests it makes — propose writes nothing, accept writes one
// entry per CHECKED slot through the ordinary entries POST — so the requests
// are the thing to assert on.
//
// Clock pinned for the same reason as the board's own suite: the fixtures are
// the week of Mon 27 July 2026 and the board marks today's row.
// ─────────────────────────────────────────────────────────────────────────

const WEEK_START = '2026-07-27T00:00:00.000Z'
const PLAN_ID = 'plan-week-1'
const NOW = new Date('2026-07-30T09:00:00.000Z')

const oats = { id: 'recipe-oats', title: 'Overnight oats', imageUrl: null, totalTimeMinutes: 5, caloriesPerServing: 300 }
const pasta = { id: 'recipe-pasta', title: 'Pasta al forno', imageUrl: null, totalTimeMinutes: 45, caloriesPerServing: 700 }

const proposal: WeekProposal = {
  weekStartDate: WEEK_START,
  slots: [
    { dayOfWeek: 'Monday', mealType: 'Breakfast', recipe: oats },
    { dayOfWeek: 'Tuesday', mealType: 'Dinner', recipe: pasta },
  ],
}

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entryCount: 1,
  totalMinutes: 45,
}

const planEntries: MealPlanEntry[] = [
  { id: 'entry-mon-dinner', dayOfWeek: 'Monday', mealType: 'Dinner', recipe: pasta },
]

const plan: MealPlan = { id: PLAN_ID, weekStartDate: WEEK_START, createdAt: WEEK_START, entries: planEntries }

interface Recorded {
  proposeBodies: unknown[]
  createdPlans: unknown[]
  entryBodies: Array<{ planId: string; body: Record<string, unknown> }>
}

/**
 * A planned week (one Monday dinner) plus the proposal endpoints, recording
 * every write. `entryStatus` lets one slot's POST 409 or 500.
 */
function proposalWeek(opts: { hasPlan?: boolean; entryStatus?: (body: Record<string, unknown>) => number } = {}): Recorded {
  const recorded: Recorded = { proposeBodies: [], createdPlans: [], entryBodies: [] }
  const hasPlan = opts.hasPlan ?? true
  server.use(
    http.get('/api/meal-plans', () =>
      HttpResponse.json({ items: hasPlan || recorded.createdPlans.length > 0 ? [summary] : [], nextCursor: null }),
    ),
    http.get('/api/meal-plans/:id', () => HttpResponse.json(hasPlan ? plan : { ...plan, entries: [] })),
    http.get('/api/meal-plans/:id/grocery-insight', () =>
      HttpResponse.json({ distinctIngredientCount: 3, sharedIngredientCount: 1, outlier: null }),
    ),
    http.post('/api/meal-plans/propose-week', async ({ request }) => {
      recorded.proposeBodies.push(await request.json())
      return HttpResponse.json(proposal)
    }),
    http.post('/api/meal-plans', async ({ request }) => {
      recorded.createdPlans.push(await request.json())
      return HttpResponse.json({ id: PLAN_ID, weekStartDate: WEEK_START, createdAt: WEEK_START, entries: [] }, { status: 201 })
    }),
    http.post('/api/meal-plans/:id/entries', async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>
      const status = opts.entryStatus?.(body) ?? 201
      if (status !== 201) {
        return HttpResponse.json({ error: 'That day/meal slot is already occupied in this plan.' }, { status })
      }
      recorded.entryBodies.push({ planId: String(params.id), body })
      return HttpResponse.json(
        { id: `entry-${recorded.entryBodies.length}`, dayOfWeek: body.dayOfWeek, mealType: body.mealType, recipe: oats },
        { status: 201 },
      )
    }),
  )
  return recorded
}

beforeEach(() => vi.setSystemTime(NOW))
afterAll(() => vi.useRealTimers())

describe('the week-proposal flow', () => {
  it('proposes for the right week and lists the slots for review, writing nothing', async () => {
    const recorded = proposalWeek()
    const user = userEvent.setup()
    renderRoute('/plan/week/2026-07-27')

    await user.click(await screen.findByRole('button', { name: /propose a week/i }))

    const dialog = await screen.findByRole('dialog', { name: /review the proposed week/i })
    expect(recorded.proposeBodies).toEqual([{ weekStartDate: WEEK_START }])
    expect(within(dialog).getByText('Overnight oats')).toBeInTheDocument()
    expect(within(dialog).getByText('Pasta al forno')).toBeInTheDocument()
    // Review is consent, not commitment: nothing has been written yet.
    expect(recorded.entryBodies).toHaveLength(0)
    expect(recorded.createdPlans).toHaveLength(0)
  })

  it('accepting writes one entry per checked slot through the ordinary entries POST', async () => {
    const recorded = proposalWeek()
    const user = userEvent.setup()
    renderRoute('/plan/week/2026-07-27')

    await user.click(await screen.findByRole('button', { name: /propose a week/i }))
    await user.click(await screen.findByRole('button', { name: /add 2 meals/i }))

    await waitFor(() => expect(recorded.entryBodies).toHaveLength(2))
    expect(recorded.entryBodies[0]).toEqual({
      planId: PLAN_ID,
      body: { dayOfWeek: 'Monday', mealType: 'Breakfast', recipeId: 'recipe-oats' },
    })
    expect(recorded.entryBodies[1]).toEqual({
      planId: PLAN_ID,
      body: { dayOfWeek: 'Tuesday', mealType: 'Dinner', recipeId: 'recipe-pasta' },
    })
    // The week already had a plan — accepting must not try to create another.
    expect(recorded.createdPlans).toHaveLength(0)
    expect(await screen.findByText(/added 2 meals/i)).toBeInTheDocument()
  })

  it('an unchecked slot is not written', async () => {
    const recorded = proposalWeek()
    const user = userEvent.setup()
    renderRoute('/plan/week/2026-07-27')

    await user.click(await screen.findByRole('button', { name: /propose a week/i }))
    const dialog = await screen.findByRole('dialog', { name: /review the proposed week/i })
    // Uncheck Monday's breakfast; only Tuesday's dinner should land.
    await user.click(within(dialog).getAllByRole('checkbox')[0])
    await user.click(screen.getByRole('button', { name: /add 1 meal/i }))

    await waitFor(() => expect(recorded.entryBodies).toHaveLength(1))
    expect(recorded.entryBodies[0].body.recipeId).toBe('recipe-pasta')
    expect(await screen.findByText(/added 1 meal\./i)).toBeInTheDocument()
  })

  it('creates the plan first when the week has none', async () => {
    const recorded = proposalWeek({ hasPlan: false })
    const user = userEvent.setup()
    renderRoute('/plan/week/2026-07-27')

    await user.click(await screen.findByRole('button', { name: /propose a week/i }))
    await user.click(await screen.findByRole('button', { name: /add 2 meals/i }))

    await waitFor(() => expect(recorded.entryBodies).toHaveLength(2))
    expect(recorded.createdPlans).toEqual([{ weekStartDate: WEEK_START }])
  })

  it('a slot taken since proposing is reported as skipped while the rest still land', async () => {
    const recorded = proposalWeek({
      entryStatus: (body) => (body.mealType === 'Breakfast' ? 409 : 201),
    })
    const user = userEvent.setup()
    renderRoute('/plan/week/2026-07-27')

    await user.click(await screen.findByRole('button', { name: /propose a week/i }))
    await user.click(await screen.findByRole('button', { name: /add 2 meals/i }))

    expect(await screen.findByText(/added 1 meal\./i)).toBeInTheDocument()
    expect(screen.getByText(/1 slot couldn't be added — those slots were already taken/i)).toBeInTheDocument()
    expect(recorded.entryBodies).toHaveLength(1)
    expect(recorded.entryBodies[0].body.mealType).toBe('Dinner')
  })

  it('a failed proposal says so and changes nothing', async () => {
    proposalWeek()
    server.use(
      http.post('/api/meal-plans/propose-week', () =>
        HttpResponse.json({ title: 'The planning assistant is temporarily unavailable.' }, { status: 502 }),
      ),
    )
    const user = userEvent.setup()
    renderRoute('/plan/week/2026-07-27')

    await user.click(await screen.findByRole('button', { name: /propose a week/i }))

    expect(await screen.findByText(/couldn't propose a week just now/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a full week offers no proposal card', async () => {
    const fullEntries: MealPlanEntry[] = (['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const)
      .flatMap((day) =>
        (['Breakfast', 'Lunch', 'Dinner'] as const).map((meal) => ({
          id: `entry-${day}-${meal}`,
          dayOfWeek: day,
          mealType: meal,
          recipe: pasta,
        })),
      )
    server.use(
      http.get('/api/meal-plans', () => HttpResponse.json({ items: [summary], nextCursor: null })),
      http.get('/api/meal-plans/:id', () => HttpResponse.json({ ...plan, entries: fullEntries })),
      http.get('/api/meal-plans/:id/grocery-insight', () =>
        HttpResponse.json({ distinctIngredientCount: 3, sharedIngredientCount: 1, outlier: null }),
      ),
    )
    renderRoute('/plan/week/2026-07-27')

    // Wait for the board to resolve, then assert the card never appeared.
    expect(await screen.findByText('Mon 27')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/loading this week's meals/i)).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /propose a week/i })).not.toBeInTheDocument()
  })
})
