import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as api from '@/api/mealPlans'
import * as social from '@/api/social'
import * as client from '@/api/client'
import type { MealPlan, MealPlanSummary } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'

// The picker is exercised through the day page, which is where it actually
// lives — the corpus (saved / mine / history) and the browse list all resolve
// against stubs so the segments have real counts to show.

const WEEK_START = '2026-07-27T00:00:00.000Z'
const PLAN_ID = 'plan-1'
const USER_ID = '11111111-1111-1111-1111-111111111111'

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
    createdByUserId: 'someone-else',
    ...over,
  }
}

const harissa = makeRecipe({ id: 'r-harissa', title: 'Green harissa chicken', totalTimeMinutes: 45 })
const orzo = makeRecipe({ id: 'r-orzo', title: 'Lemon orzo', totalTimeMinutes: 25 })
const ramen = makeRecipe({ id: 'r-ramen', title: 'Quick ramen', totalTimeMinutes: 30, createdByUserId: USER_ID })

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entryCount: 1,
  totalMinutes: 45,
}

/** Harissa already sits on Tuesday — the picker must warn, not hide. */
const plan: MealPlan = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entries: [
    {
      id: 'entry-tue',
      dayOfWeek: 'Tuesday',
      mealType: 'Dinner',
      recipe: { id: 'r-harissa', title: 'Green harissa chicken', imageUrl: null, totalTimeMinutes: 30 },
    },
  ],
}

function stubEverything() {
  vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
  vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
  // History: one prior plan, so "Again" has something in it.
  vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
  vi.spyOn(social, 'getSavedRecipes').mockResolvedValue({ items: [orzo], nextCursor: null })

  vi.spyOn(client, 'apiFetch').mockImplementation(((path: string) => {
    if (path === '/recipes') {
      return Promise.resolve({ items: [harissa, orzo, ramen], nextCursor: null })
    }
    // Must precede the /recipes/{id} branch below — "mine" is a list route, not
    // an id. The server scopes it to the caller, so this returns only ramen
    // (the one carrying USER_ID) rather than everything for the client to sift.
    if (path === '/recipes/mine') {
      return Promise.resolve({ items: [ramen], nextCursor: null })
    }
    if (path.startsWith('/recipes/')) {
      const id = path.slice('/recipes/'.length)
      return Promise.resolve([harissa, orzo, ramen].find((r) => r.id === id))
    }
    return Promise.resolve(undefined)
  }) as unknown as typeof client.apiFetch)
}

/** Open the picker on Wednesday dinner and hand back its panel. */
async function openPicker() {
  const user = userEvent.setup()
  renderRoute('/plan/2026-07-29')
  const add = await screen.findByRole('button', { name: /add a recipe for dinner/i })
  await user.click(add)
  await screen.findByRole('heading', { name: /what's for dinner\?/i })
  return user
}

describe('the recipe picker', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('heads itself with the slot that was tapped', async () => {
    stubEverything()
    await openPicker()

    expect(screen.getByRole('heading', { name: /what's for dinner\?/i })).toBeInTheDocument()
    // The date half of the subtitle is locale-formatted, so assert the count.
    expect(screen.getByText(/3 slots open/i)).toBeInTheDocument()
  })

  it('offers the personal lenses with their counts, defaulting to Again', async () => {
    stubEverything()
    await openPicker()

    const again = await screen.findByRole('tab', { name: /again/i })
    await waitFor(() => expect(again).toHaveAttribute('aria-selected', 'true'))
    expect(screen.getByRole('tab', { name: /saved/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /mine/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^all$/i })).toBeInTheDocument()
  })

  it('filters as you type, without a round trip', async () => {
    stubEverything()
    const user = await openPicker()

    await user.click(screen.getByRole('tab', { name: /saved/i }))
    await screen.findByRole('button', { name: 'Lemon orzo' })

    await user.type(screen.getByRole('searchbox', { name: /search your recipes/i }), 'zzz')

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lemon orzo' })).not.toBeInTheDocument())
    expect(screen.getByText(/no match for "zzz"/i)).toBeInTheDocument()
  })

  it('marks a dish already planned this week rather than hiding it', async () => {
    stubEverything()
    const user = await openPicker()

    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    const row = await screen.findByRole('button', { name: 'Green harissa chicken' })

    // Still pickable — a warning, never a block.
    expect(within(row).getByText(/planned tue/i)).toBeInTheDocument()
    expect(row).toBeEnabled()
  })

  it('shows cook time first, then why the recipe is in the list', async () => {
    stubEverything()
    const user = await openPicker()

    await user.click(screen.getByRole('tab', { name: /saved/i }))
    const row = await screen.findByRole('button', { name: 'Lemon orzo' })

    expect(within(row).getByText(/^25 min · saved$/)).toBeInTheDocument()
  })

  it('places instantly and offers an undo instead of a confirm', async () => {
    stubEverything()
    const added = vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-new',
      dayOfWeek: 'Wednesday',
      mealType: 'Dinner',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null, totalTimeMinutes: 30 },
    })

    const user = await openPicker()
    await user.click(screen.getByRole('tab', { name: /saved/i }))
    await user.click(await screen.findByRole('button', { name: 'Lemon orzo' }))

    await waitFor(() =>
      expect(added).toHaveBeenCalledWith(PLAN_ID, {
        dayOfWeek: 'Wednesday',
        mealType: 'Dinner',
        recipeId: 'r-orzo',
      }),
    )
    expect(await screen.findByRole('button', { name: /undo/i })).toBeInTheDocument()
    // No confirmation dialog stood between the tap and the write.
    expect(screen.queryByRole('dialog', { name: /are you sure/i })).not.toBeInTheDocument()
  })

  it('says what a dish would add to the day, and when it reuses something', async () => {
    // Wednesday breakfast is Shakshuka (garlic, eggs); the day already needs
    // garlic, so a dish sharing it should say so rather than count it as new.
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue({
      ...plan,
      entries: [
        ...plan.entries,
        {
          id: 'entry-wed-brk',
          dayOfWeek: 'Wednesday',
          mealType: 'Breakfast',
          recipe: { id: 'r-shak', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
        },
      ],
    })
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(social, 'getSavedRecipes').mockResolvedValue({
      items: [
        makeRecipe({
          id: 'r-shak',
          title: 'Shakshuka',
          ingredients: [
            { name: 'Eggs', quantity: 6, unit: '' },
            { name: 'Garlic', quantity: 2, unit: 'cloves' },
          ],
        }),
        makeRecipe({
          id: 'r-aioli',
          title: 'Garlic aioli',
          totalTimeMinutes: 10,
          ingredients: [{ name: 'Garlic', quantity: 4, unit: 'cloves' }],
        }),
        makeRecipe({
          id: 'r-ramen',
          title: 'Quick ramen',
          totalTimeMinutes: 30,
          ingredients: [
            { name: 'Noodles', quantity: 2, unit: 'nests' },
            { name: 'Stock', quantity: 500, unit: 'ml' },
          ],
        }),
      ],
      nextCursor: null,
    })
    vi.spyOn(client, 'apiFetch').mockImplementation(((path: string) => {
      if (path === '/recipes') return Promise.resolve({ items: [], nextCursor: null })
      if (path === '/recipes/mine') return Promise.resolve({ items: [], nextCursor: null })
      if (path === '/recipes/r-shak') {
        return Promise.resolve(
          makeRecipe({
            id: 'r-shak',
            title: 'Shakshuka',
            ingredients: [
              { name: 'Eggs', quantity: 6, unit: '' },
              { name: 'Garlic', quantity: 2, unit: 'cloves' },
            ],
          }),
        )
      }
      return Promise.resolve(undefined)
    }) as unknown as typeof client.apiFetch)

    const user = await openPicker()
    await user.click(screen.getByRole('tab', { name: /saved/i }))

    const aioli = await screen.findByRole('button', { name: 'Garlic aioli' })
    await waitFor(() => expect(within(aioli).getByText(/uses Garlic ✓/i)).toBeInTheDocument())

    const ramen = screen.getByRole('button', { name: 'Quick ramen' })
    expect(within(ramen).getByText(/\+2 items/i)).toBeInTheDocument()
  })

  it('creates the week on the first pick when there is no plan yet', async () => {
    stubEverything()
    vi.spyOn(api, 'getMealPlanForWeek')
      .mockResolvedValueOnce(null) // the page's initial lookup
      .mockResolvedValue(null) // and the lookup inside ensure-or-create
    const created = vi.spyOn(api, 'createMealPlan').mockResolvedValue({ ...plan, entries: [] })
    const added = vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-new',
      dayOfWeek: 'Wednesday',
      mealType: 'Dinner',
      recipe: { id: 'r-orzo', title: 'Lemon orzo', imageUrl: null, totalTimeMinutes: 30 },
    })

    const user = await openPicker()
    await user.click(screen.getByRole('tab', { name: /saved/i }))
    await user.click(await screen.findByRole('button', { name: 'Lemon orzo' }))

    await waitFor(() => expect(created).toHaveBeenCalledWith(WEEK_START))
    await waitFor(() => expect(added).toHaveBeenCalledWith(PLAN_ID, expect.objectContaining({ recipeId: 'r-orzo' })))
  })
})
