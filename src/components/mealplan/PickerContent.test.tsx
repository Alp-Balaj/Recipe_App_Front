import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
/**
 * Deliberately NOT in the unsearched `/recipes` page below — a public recipe
 * the All segment has not paged to, the way page four of a large catalogue
 * would not be loaded yet. Findable only by reaching the server.
 */
const menemen = makeRecipe({ id: 'r-menemen', title: 'Menemen' })

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

let apiFetch: ReturnType<typeof vi.spyOn>

function stubEverything() {
  vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
  vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
  // History: one prior plan, so "Again" has something in it.
  vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
  vi.spyOn(social, 'getSavedRecipes').mockResolvedValue({ items: [orzo], nextCursor: null })

  apiFetch = vi.spyOn(client, 'apiFetch').mockImplementation(((
    path: string,
    options?: { query?: Record<string, unknown> },
  ) => {
    if (path === '/recipes') {
      // A stand-in for the server's ?search= — menemen only turns up once a
      // search term reaches this mock, exactly like `websearch_to_tsquery`
      // would only be asked to run once the request actually carries one.
      const search = typeof options?.query?.search === 'string' ? options.query.search.toLowerCase() : ''
      const items = search
        ? [harissa, orzo, ramen, menemen].filter((r) => r.title.toLowerCase().includes(search))
        : [harissa, orzo, ramen]
      return Promise.resolve({ items, nextCursor: null })
    }
    // Must precede the /recipes/{id} branch below — "mine" is a list route, not
    // an id. The server scopes it to the caller, so this returns only ramen
    // (the one carrying USER_ID) rather than everything for the client to sift.
    if (path === '/recipes/mine') {
      return Promise.resolve({ items: [ramen], nextCursor: null })
    }
    if (path.startsWith('/recipes/')) {
      const id = path.slice('/recipes/'.length)
      return Promise.resolve([harissa, orzo, ramen, menemen].find((r) => r.id === id))
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

// ── Pinned clock ──────────────────────────────────────────────────────────
// Found while running the gate for the week/shopping rework (Tasks 5+6), on an
// otherwise UNCHANGED tree: every case below hard-codes Wed 29 July 2026 as
// "today", and the day page refuses additions on a PAST day (MealCard's isPast
// branch renders "No dinner recorded" and no Add button). The moment real UTC time
// passed that date these tests started failing for nothing the code did. Pin
// "now" to the fixture's day so the suite stops depending on when it is run.
const NOW = new Date('2026-07-29T12:00:00.000Z')

function resetPerTest() {
  vi.restoreAllMocks()
  vi.setSystemTime(NOW)
}

afterAll(() => vi.useRealTimers())

describe('the recipe picker', () => {
  beforeEach(resetPerTest)

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
            { name: 'Eggs', quantity: 6, unit: 'Piece' },
            { name: 'Garlic', quantity: 2, unit: 'Clove' },
          ],
        }),
        makeRecipe({
          id: 'r-aioli',
          title: 'Garlic aioli',
          totalTimeMinutes: 10,
          ingredients: [{ name: 'Garlic', quantity: 4, unit: 'Clove' }],
        }),
        makeRecipe({
          id: 'r-ramen',
          title: 'Quick ramen',
          totalTimeMinutes: 30,
          ingredients: [
            { name: 'Noodles', quantity: 2, unit: 'Piece' },
            { name: 'Stock', quantity: 500, unit: 'Millilitre' },
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
              { name: 'Eggs', quantity: 6, unit: 'Piece' },
              { name: 'Garlic', quantity: 2, unit: 'Clove' },
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

// ── KAN-17: the All segment searches the server ────────────────────────────
// These run on REAL timers, like BrowsePage.test.tsx's own search block —
// waitFor/findBy poll on the very timers fake ones would need faked, and the
// 300ms debounce comfortably fits waitFor's default 1000ms budget. Typing goes
// through fireEvent rather than user-event so keystrokes land with no await
// between them, inside one debounce window.
describe('the recipe picker — All segment search', () => {
  beforeEach(resetPerTest)

  it('finds a recipe it has not paged to', async () => {
    stubEverything()
    const user = await openPicker()

    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await screen.findByRole('button', { name: 'Green harissa chicken' })
    expect(screen.queryByRole('button', { name: 'Menemen' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: /search your recipes/i }), {
      target: { value: 'menemen' },
    })

    expect(await screen.findByRole('button', { name: 'Menemen' })).toBeInTheDocument()
  })

  it('debounces — typing does not fire a request per keystroke', async () => {
    stubEverything()
    const user = await openPicker()
    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await screen.findByRole('button', { name: 'Green harissa chicken' })

    const requestsFor = (search: string) => {
      const calls = apiFetch.mock.calls as [string, { query?: Record<string, unknown> }?][]
      return calls.filter(([path, options]) => path === '/recipes' && options?.query?.search === search).length
    }

    const input = screen.getByRole('searchbox', { name: /search your recipes/i })
    // Five keystrokes with no await between them — all inside one debounce window.
    for (const value of ['m', 'me', 'men', 'mene', 'menem']) {
      fireEvent.change(input, { target: { value } })
    }

    await waitFor(() => expect(requestsFor('menem')).toBe(1))
    // Settle well past the window and confirm no straggler requests for the
    // intermediate values followed.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(requestsFor('m')).toBe(0)
    expect(requestsFor('me')).toBe(0)
    expect(requestsFor('men')).toBe(0)
    expect(requestsFor('mene')).toBe(0)
    expect(requestsFor('menem')).toBe(1)
  })

  it('keys the search into the query, so a stale response cannot land on a newer one', async () => {
    stubEverything()
    const user = await openPicker()
    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await screen.findByRole('button', { name: 'Green harissa chicken' })

    fireEvent.change(screen.getByRole('searchbox', { name: /search your recipes/i }), {
      target: { value: 'menemen' },
    })

    // The menemen-only result, not the unsearched list still sitting behind it.
    await screen.findByRole('button', { name: 'Menemen' })
    expect(screen.queryByRole('button', { name: 'Green harissa chicken' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lemon orzo' })).not.toBeInTheDocument()
  })

  it('clearing the search returns to the unfiltered All segment', async () => {
    stubEverything()
    const user = await openPicker()
    await user.click(screen.getByRole('tab', { name: /^all$/i }))
    await screen.findByRole('button', { name: 'Green harissa chicken' })

    const input = screen.getByRole('searchbox', { name: /search your recipes/i })
    fireEvent.change(input, { target: { value: 'menemen' } })
    await screen.findByRole('button', { name: 'Menemen' })

    fireEvent.change(input, { target: { value: '' } })

    expect(await screen.findByRole('button', { name: 'Green harissa chicken' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lemon orzo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Menemen' })).not.toBeInTheDocument()
  })
})
