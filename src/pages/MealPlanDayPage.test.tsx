import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as api from '@/api/mealPlans'
import * as client from '@/api/client'
import type { MealPlan, MealPlanSummary } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'

// The day page resolves week → plan → entries, then fetches each planned
// recipe in full for its ingredients. Plan calls are stubbed on the api module
// (the idiom MealPlanPage.test.tsx uses); the recipe details go through
// apiFetch, so that is stubbed once and routed by path.

const WEEK_START = '2026-07-27T00:00:00.000Z' // the Monday of Wed 29 July 2026
const PLAN_ID = 'plan-1'

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: '2026-07-27T00:00:00.000Z',
  entryCount: 2,
}

const plan: MealPlan = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: '2026-07-27T00:00:00.000Z',
  entries: [
    {
      id: 'entry-breakfast',
      dayOfWeek: 'Wednesday',
      mealType: 'Breakfast',
      recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null },
    },
    {
      id: 'entry-lunch',
      dayOfWeek: 'Wednesday',
      mealType: 'Lunch',
      recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null },
    },
    {
      // A different day — must not appear on Wednesday's page.
      id: 'entry-thursday',
      dayOfWeek: 'Thursday',
      mealType: 'Dinner',
      recipe: { id: 'recipe-ramen', title: 'Quick ramen', imageUrl: null },
    },
  ],
}

function makeRecipe(over: Partial<RecipeResponse> & Pick<RecipeResponse, 'id' | 'title'>): RecipeResponse {
  return {
    description: '',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: null,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: [],
    createdByUserId: '11111111-1111-1111-1111-111111111111',
    ...over,
  }
}

const shakshuka = makeRecipe({
  id: 'recipe-shakshuka',
  title: 'Shakshuka',
  servings: 2,
  ingredients: [
    { name: 'Eggs', quantity: 6, unit: '' },
    { name: 'Garlic', quantity: 2, unit: 'cloves' },
  ],
})

const cornSalad = makeRecipe({
  id: 'recipe-corn',
  title: 'Charred corn salad',
  servings: 4,
  ingredients: [
    { name: 'Corn cobs', quantity: 4, unit: '' },
    { name: 'Garlic', quantity: 1, unit: 'clove' },
  ],
})

/**
 * Route apiFetch by path so the two recipe details resolve independently.
 * The bare /recipes list must answer with a real page shape — the picker's
 * browse segment runs through useInfiniteRecipes, which reads nextCursor off
 * the last page.
 */
function stubRecipeDetails() {
  vi.spyOn(client, 'apiFetch').mockImplementation(((path: string) => {
    if (path === '/recipes') {
      return Promise.resolve({ items: [shakshuka, cornSalad], nextCursor: null })
    }
    if (path === '/recipes/recipe-shakshuka') return Promise.resolve(shakshuka)
    if (path === '/recipes/recipe-corn') return Promise.resolve(cornSalad)
    return Promise.resolve(undefined)
  }) as unknown as typeof client.apiFetch)
}

describe('the day page', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a malformed date instead of rendering a day', async () => {
    renderRoute('/plan/not-a-date')

    await waitFor(() =>
      expect(screen.getByText(/that date doesn't look right/i)).toBeInTheDocument(),
    )
  })

  it('rejects a date that looks right but does not exist', async () => {
    renderRoute('/plan/2026-02-31')

    await waitFor(() =>
      expect(screen.getByText(/that date doesn't look right/i)).toBeInTheDocument(),
    )
  })

  it('heads the page with the day it was asked for', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderRoute('/plan/2026-07-29')

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /wednesday/i })).toBeInTheDocument(),
    )
  })

  // Cold start removed: an unplanned week shows the day anyway, and the first
  // pick creates the plan. You never build an empty container first.
  it('renders an addable day even when the week has no plan yet', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderRoute('/plan/2026-07-29')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add a recipe for dinner/i })).toBeEnabled(),
    )
    expect(screen.queryByRole('button', { name: /plan this week/i })).not.toBeInTheDocument()
  })

  it("shows only that day's meals, and marks the empty one", async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubRecipeDetails()

    renderRoute('/plan/2026-07-29')

    await waitFor(() =>
      expect(within(screen.getByTestId('day-slot-Breakfast')).getByText('Shakshuka')).toBeInTheDocument(),
    )

    expect(within(screen.getByTestId('day-slot-Lunch')).getByText('Charred corn salad')).toBeInTheDocument()
    // Thursday's dinner belongs to another day's page.
    expect(screen.queryByText('Quick ramen')).not.toBeInTheDocument()
    expect(screen.getByTestId('day-slot-Dinner')).toHaveTextContent(/add dinner/i)
  })

  it("lists each dish's ingredients under its own heading", async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubRecipeDetails()

    renderRoute('/plan/2026-07-29')

    const panel = await screen.findByLabelText(/what you'll need today/i)
    await waitFor(() => expect(within(panel).getByText('Eggs')).toBeInTheDocument())

    expect(within(panel).getByText('Corn cobs')).toBeInTheDocument()
    expect(within(panel).getByText('6')).toBeInTheDocument()
    expect(within(panel).getByText('2 cloves')).toBeInTheDocument()
    // Grouped, not merged: garlic stays as two separate rows.
    expect(within(panel).getAllByText('Garlic')).toHaveLength(2)
    expect(within(panel).getByText('4 items across 2 dishes')).toBeInTheDocument()
  })

  it('names the ingredient shared across dishes rather than adding it up', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubRecipeDetails()

    renderRoute('/plan/2026-07-29')

    await waitFor(() =>
      expect(screen.getByText(/garlic appears in more than one dish/i)).toBeInTheDocument(),
    )
    // No merged "3 cloves" total is invented anywhere.
    expect(screen.queryByText('3 cloves')).not.toBeInTheDocument()
  })

  // ── Fill mode and swap ────────────────────────────────────────────────────

  it('stays open and advances to the next empty slot after placing', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    // Only breakfast filled, so lunch is placed and dinner is what's left.
    vi.spyOn(api, 'getMealPlan').mockResolvedValue({
      ...plan,
      entries: plan.entries.filter((e) => e.mealType !== 'Lunch'),
    })
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-new',
      dayOfWeek: 'Wednesday',
      mealType: 'Lunch',
      recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null },
    })
    stubRecipeDetails()
    const user = userEvent.setup()

    renderRoute('/plan/2026-07-29')

    await user.click(await screen.findByRole('button', { name: /add a recipe for lunch/i }))
    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await user.click(await screen.findByRole('button', { name: 'Charred corn salad' }))

    // The picker did not close — it moved on to the slot it had named.
    expect(await screen.findByRole('heading', { name: /what's for dinner\?/i })).toBeInTheDocument()
  })

  it('closes after a swap, because you came to change one thing', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(api, 'removeMealPlanEntry').mockResolvedValue(undefined)
    vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-swapped',
      dayOfWeek: 'Wednesday',
      mealType: 'Breakfast',
      recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null },
    })
    stubRecipeDetails()
    const user = userEvent.setup()

    renderRoute('/plan/2026-07-29')

    await user.click(await screen.findByRole('button', { name: /swap shakshuka/i }))
    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await user.click(await screen.findByRole('button', { name: 'Charred corn salad' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /what's for/i })).not.toBeInTheDocument(),
    )
  })

  it('names the next slot before you pick, when one is left', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    // Only breakfast filled, so lunch then dinner remain.
    vi.spyOn(api, 'getMealPlan').mockResolvedValue({
      ...plan,
      entries: plan.entries.filter((e) => e.mealType !== 'Lunch'),
    })
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    stubRecipeDetails()
    const user = userEvent.setup()

    renderRoute('/plan/2026-07-29')

    await user.click(await screen.findByRole('button', { name: /add a recipe for lunch/i }))

    await screen.findByRole('heading', { name: /what's for lunch\?/i })
    expect(screen.getByText(/then: dinner →/i)).toBeInTheDocument()
  })

  it('swaps a filled slot without leaving it empty on failure', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    stubRecipeDetails()

    const remove = vi.spyOn(api, 'removeMealPlanEntry').mockResolvedValue(undefined)
    // The replacement POST fails — the original must be put back.
    const add = vi
      .spyOn(api, 'addMealPlanEntry')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({
        id: 'entry-breakfast',
        dayOfWeek: 'Wednesday',
        mealType: 'Breakfast',
        recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null },
      })

    const user = userEvent.setup()
    renderRoute('/plan/2026-07-29')

    await user.click(await screen.findByRole('button', { name: /swap shakshuka/i }))
    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await user.click(await screen.findByRole('button', { name: 'Charred corn salad' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith(PLAN_ID, 'entry-breakfast'))
    // Second call is the restore of what was there.
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2))
    expect(add).toHaveBeenLastCalledWith(PLAN_ID, {
      dayOfWeek: 'Wednesday',
      mealType: 'Breakfast',
      recipeId: 'recipe-shakshuka',
    })
    expect(await screen.findByText(/what was there has been kept/i)).toBeInTheDocument()
  })

  it('links to the neighbouring days', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderRoute('/plan/2026-07-29')

    const nav = await screen.findByRole('navigation', { name: /nearby days/i })
    const links = within(nav).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/plan/2026-07-28', '/plan/2026-07-30'])
  })
})
