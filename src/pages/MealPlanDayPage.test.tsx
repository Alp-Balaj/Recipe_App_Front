import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { renderRoute } from '@/test/utils'
import * as api from '@/api/mealPlans'
import * as planNutrition from '@/api/planNutrition'
import * as client from '@/api/client'
import type { MealPlan, MealPlanSummary } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'

// The day page resolves week → plan → entries, then fetches each planned
// recipe in full for its ingredients. Plan calls are stubbed on the api module
// (the idiom the retired week-board test used); the recipe details go through
// apiFetch, so that is stubbed once and routed by path.

const WEEK_START = '2026-07-27T00:00:00.000Z' // the Monday of Wed 29 July 2026
const PLAN_ID = 'plan-1'

const summary: MealPlanSummary = {
  id: PLAN_ID,
  weekStartDate: WEEK_START,
  createdAt: '2026-07-27T00:00:00.000Z',
  entryCount: 2,
  totalMinutes: 70,
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
      recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
    },
    {
      id: 'entry-lunch',
      dayOfWeek: 'Wednesday',
      mealType: 'Lunch',
      recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null, totalTimeMinutes: 30 },
    },
    {
      // A different day — must not appear on Wednesday's page.
      id: 'entry-thursday',
      dayOfWeek: 'Thursday',
      mealType: 'Dinner',
      recipe: { id: 'recipe-ramen', title: 'Quick ramen', imageUrl: null, totalTimeMinutes: 30 },
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
    { name: 'Eggs', quantity: 6, unit: 'Piece' },
    { name: 'Garlic', quantity: 2, unit: 'Clove' },
  ],
})

const cornSalad = makeRecipe({
  id: 'recipe-corn',
  title: 'Charred corn salad',
  servings: 4,
  ingredients: [
    { name: 'Corn cobs', quantity: 4, unit: 'Piece' },
    { name: 'Garlic', quantity: 1, unit: 'Clove' },
  ],
})

// Shopping-list consequence banner (Task 9). These carry the corpus's own
// notion of ingredients — reached only through the picker corpus's saved /
// mine / history sources, never the bare browse list (PickerContent strips
// ingredients when it maps the browse page, see usePickerCorpus.ts).
const tomatoSoup = makeRecipe({
  id: 'recipe-soup',
  title: 'Tomato soup',
  ingredients: [
    { name: 'Tomato', quantity: 4, unit: 'Piece' },
    { name: 'Onion', quantity: 1, unit: 'Piece' },
    { name: 'Basil', quantity: 1, unit: 'Bunch' },
  ],
})

const noIngredientDish = makeRecipe({
  id: 'recipe-empty',
  title: 'Buttered toast',
  ingredients: [],
})

/**
 * Same idea as stubRecipeDetails, but also answers /recipes/mine with a
 * caller-supplied recipe so the page's own usePickerCorpus (not just
 * PickerContent's) carries that recipe's ingredients — the source
 * setPlaced's ingredientCount lookup reads from.
 */
function stubPickerCorpus(mineRecipe: RecipeResponse) {
  vi.spyOn(client, 'apiFetch').mockImplementation(((path: string) => {
    if (path === '/recipes') {
      return Promise.resolve({ items: [shakshuka, cornSalad], nextCursor: null })
    }
    if (path === '/recipes/mine') return Promise.resolve({ items: [mineRecipe], nextCursor: null })
    if (path === '/users/me/saved-recipes') return Promise.resolve({ items: [], nextCursor: null })
    if (path === '/recipes/recipe-shakshuka') return Promise.resolve(shakshuka)
    if (path === '/recipes/recipe-corn') return Promise.resolve(cornSalad)
    if (path === `/recipes/${mineRecipe.id}`) return Promise.resolve(mineRecipe)
    return Promise.resolve(undefined)
  }) as unknown as typeof client.apiFetch)
}

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

describe('the day page', () => {
  beforeEach(resetPerTest)

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

  // --- unavailable meals (KAN-1) -------------------------------------------------------

  describe('a meal whose recipe is no longer available', () => {
    /** Wednesday's lunch, after its author deleted the recipe or stopped sharing it. */
    const planWithUnavailableLunch: MealPlan = {
      ...plan,
      entries: plan.entries.map((entry) =>
        entry.id === 'entry-lunch' ? { ...entry, recipe: null } : entry,
      ),
    }

    it('keeps the slot instead of quietly emptying it', async () => {
      vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
      vi.spyOn(api, 'getMealPlan').mockResolvedValue(planWithUnavailableLunch)
      stubRecipeDetails()

      renderRoute('/plan/2026-07-29')

      // Wait for the WEEK to land first. Every slot renders before the plan arrives, so
      // asserting straight on Lunch would pass against the not-yet-loaded page — which is
      // exactly the "Add lunch" state this test exists to rule out. Scoped to the breakfast
      // slot because the dish name also appears in the ingredients section below.
      await waitFor(() =>
        expect(within(screen.getByTestId('day-slot-Breakfast')).getByText('Shakshuka')).toBeInTheDocument(),
      )
      const lunch = screen.getByTestId('day-slot-Lunch')

      // NOT the empty-slot state: the user planned a meal here and the plan still says so.
      expect(lunch).toHaveTextContent(/unavailable/i)
      expect(lunch).not.toHaveTextContent(/add lunch/i)
      // And the withheld title is nowhere on the page.
      expect(screen.queryByText('Charred corn salad')).not.toBeInTheDocument()
    })

    it('offers only Remove — every other action needs the recipe', async () => {
      vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
      vi.spyOn(api, 'getMealPlan').mockResolvedValue(planWithUnavailableLunch)
      stubRecipeDetails()

      renderRoute('/plan/2026-07-29')

      // Wait for the WEEK to land first. Every slot renders before the plan arrives, so
      // asserting straight on Lunch would pass against the not-yet-loaded page — which is
      // exactly the "Add lunch" state this test exists to rule out. Scoped to the breakfast
      // slot because the dish name also appears in the ingredients section below.
      await waitFor(() =>
        expect(within(screen.getByTestId('day-slot-Breakfast')).getByText('Shakshuka')).toBeInTheDocument(),
      )
      const lunch = screen.getByTestId('day-slot-Lunch')
      const within_ = within(lunch)

      // Removing your own record must always work (ADR-0001) — a slot its owner can
      // neither open nor clear is exactly the orphan that rule exists to prevent.
      expect(within_.getByRole('button', { name: /remove the unavailable lunch/i })).toBeEnabled()

      // Recipe / Swap / Repeat / "I cooked this" all need an id and would 404 on press.
      expect(within_.queryByRole('link', { name: /recipe/i })).not.toBeInTheDocument()
      expect(within_.queryByRole('button', { name: /swap/i })).not.toBeInTheDocument()
      expect(within_.queryByRole('button', { name: /repeat/i })).not.toBeInTheDocument()
      expect(within_.queryByRole('button', { name: /cooked/i })).not.toBeInTheDocument()
    })

    // ADR-0001 splits writes by DIRECTION: creating a relationship to the recipe needs
    // visibility, destroying your own row does not. Un-cooking is the second kind — it posts
    // only the entry id, and the server gates it on ownership (KAN-3). This card is the app's
    // only un-cook surface, so dropping the button here would strand the cook forever, with
    // the single remaining action (×) deleting the plan entry instead of undoing the cook.
    it('still lets you take back a cook you logged before it became unavailable', async () => {
      const cookedPlan: MealPlan = {
        ...planWithUnavailableLunch,
        entries: planWithUnavailableLunch.entries.map((entry) =>
          entry.id === 'entry-lunch'
            ? { ...entry, cookedAt: '2026-07-29T18:00:00.000Z', cookNoteCount: 0 }
            : entry,
        ),
      }
      vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
      vi.spyOn(api, 'getMealPlan').mockResolvedValue(cookedPlan)
      stubRecipeDetails()

      renderRoute('/plan/2026-07-29')

      await waitFor(() =>
        expect(within(screen.getByTestId('day-slot-Breakfast')).getByText('Shakshuka')).toBeInTheDocument(),
      )
      const lunch = within(screen.getByTestId('day-slot-Lunch'))

      const undo = lunch.getByRole('button', { name: /undo cooked for the unavailable lunch/i })
      expect(undo).toBeEnabled()
      // And it is the UNDO, not the remove — pressing it must not delete the plan entry.
      expect(lunch.getByRole('button', { name: /remove the unavailable lunch/i })).toBeEnabled()
    })

    // The ingredients section reads `title === null` as "this slot is free", so returning
    // null for a withheld meal printed "not chosen yet" directly beneath a card saying
    // "Recipe unavailable — still planned", and a day whose only meal was withheld fell
    // through to "Nothing planned yet". That is the disappearing-planned-meal failure this
    // ticket exists to stop, one section lower down the same page.
    it('does not report the withheld meal as an unchosen slot', async () => {
      vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
      vi.spyOn(api, 'getMealPlan').mockResolvedValue(planWithUnavailableLunch)
      stubRecipeDetails()

      renderRoute('/plan/2026-07-29')

      await waitFor(() =>
        expect(within(screen.getByTestId('day-slot-Breakfast')).getByText('Shakshuka')).toBeInTheDocument(),
      )

      // Dinner really is unchosen; Lunch is not, and only one of them may say so.
      expect(screen.getAllByText(/not chosen yet/i)).toHaveLength(1)
      expect(screen.getByText(/its ingredients aren’t here/i)).toBeInTheDocument()
      expect(screen.queryByText(/nothing planned yet/i)).not.toBeInTheDocument()
    })

    // "Unavailable" is ONE state (ADR-0001, KAN-2). Naming which cause applied would
    // report an author's private visibility decision to a stranger, and for a recipe
    // merely made private "deleted" is also simply false.
    it('never says why', async () => {
      vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
      vi.spyOn(api, 'getMealPlan').mockResolvedValue(planWithUnavailableLunch)
      stubRecipeDetails()

      renderRoute('/plan/2026-07-29')

      // Wait for the WEEK to land first. Every slot renders before the plan arrives, so
      // asserting straight on Lunch would pass against the not-yet-loaded page — which is
      // exactly the "Add lunch" state this test exists to rule out. Scoped to the breakfast
      // slot because the dish name also appears in the ingredients section below.
      await waitFor(() =>
        expect(within(screen.getByTestId('day-slot-Breakfast')).getByText('Shakshuka')).toBeInTheDocument(),
      )
      const copy = (screen.getByTestId('day-slot-Lunch').textContent ?? '').toLowerCase()
      for (const forbidden of ['delet', 'privat', 'hidden', 'unshared', 'author']) {
        expect(copy).not.toContain(forbidden)
      }
    })
  })

  it("lists each dish's ingredients under its own heading", async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubRecipeDetails()

    renderRoute('/plan/2026-07-29')

    const panel = await screen.findByLabelText(/what you'll need today/i)
    await waitFor(() => expect(within(panel).getByText('Eggs')).toBeInTheDocument())

    expect(within(panel).getByText('Corn cobs')).toBeInTheDocument()
    // "6 pcs", not a bare "6": the fixture's unit used to be an empty string,
    // which formatQuantity rendered as nothing. A closed vocabulary has no empty
    // member — Piece is the neutral count — so the unit always renders now.
    expect(within(panel).getByText('6 pcs')).toBeInTheDocument()
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
      recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null, totalTimeMinutes: 30 },
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
      recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null, totalTimeMinutes: 30 },
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
        recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
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

  // ── The shopping-list consequence (Task 9) ──────────────────────────────

  it('names the shopping-list consequence when a meal is placed', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan) // breakfast + lunch filled, dinner open
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-soup',
      dayOfWeek: 'Wednesday',
      mealType: 'Dinner',
      recipe: { id: 'recipe-soup', title: 'Tomato soup', imageUrl: null, totalTimeMinutes: 20 },
    })
    stubPickerCorpus(tomatoSoup)
    const user = userEvent.setup()

    renderRoute('/plan/2026-07-29')

    await user.click(await screen.findByRole('button', { name: /add a recipe for dinner/i }))
    // History outranks Mine in the default segment (there's a planned-before
    // recipe in the fixture plan), so the picker opens on "Again" — jump to
    // "Mine", which is where the corpus-sourced fixture recipe actually lives.
    await user.click(await screen.findByRole('tab', { name: /^mine/i }))
    await user.click(await screen.findByRole('button', { name: 'Tomato soup' }))

    expect(await screen.findByText(/3 ingredients on your shopping list/i)).toBeInTheDocument()
  })

  it('warns when the placed recipe has no ingredient list', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan) // breakfast + lunch filled, dinner open
    vi.spyOn(api, 'getMealPlans').mockResolvedValue({ items: [summary], nextCursor: null })
    vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-toast',
      dayOfWeek: 'Wednesday',
      mealType: 'Dinner',
      recipe: { id: 'recipe-empty', title: 'Buttered toast', imageUrl: null, totalTimeMinutes: 5 },
    })
    stubPickerCorpus(noIngredientDish)
    const user = userEvent.setup()

    renderRoute('/plan/2026-07-29')

    await user.click(await screen.findByRole('button', { name: /add a recipe for dinner/i }))
    // Same reason as the sibling test: jump past the default "Again" segment
    // to "Mine", where the corpus-sourced fixture recipe lives.
    await user.click(await screen.findByRole('tab', { name: /^mine/i }))
    await user.click(await screen.findByRole('button', { name: 'Buttered toast' }))

    expect(await screen.findByText(/no ingredient list/i)).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Day totals + Repeat tomorrow (meal-plan insights, day PR).
// ─────────────────────────────────────────────────────────────────────────

/** Wed 29 July 2026 is a weekday mid-week; Sun 2 Aug is the week-boundary case. */
const SUNDAY_PLAN_ID = 'plan-sunday'
const NEXT_WEEK_START = '2026-08-03T00:00:00.000Z'

function stubDetails(recipes: RecipeResponse[]) {
  vi.spyOn(client, 'apiFetch').mockImplementation(((path: string) => {
    if (path === '/recipes') return Promise.resolve({ items: recipes, nextCursor: null })
    const hit = recipes.find((recipe) => path === `/recipes/${recipe.id}`)
    return Promise.resolve(hit ?? undefined)
  }) as unknown as typeof client.apiFetch)
}

describe('the day totals strip', () => {
  beforeEach(resetPerTest)

  it('adds up calories and kitchen time when every meal has a figure', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubDetails([
      makeRecipe({ id: 'recipe-shakshuka', title: 'Shakshuka', caloriesPerServing: 420, totalTimeMinutes: 25 }),
      makeRecipe({ id: 'recipe-corn', title: 'Charred corn salad', caloriesPerServing: 610, totalTimeMinutes: 35 }),
    ])

    renderRoute('/plan/2026-07-29')

    const totals = await screen.findByRole('region', { name: /totals for this day/i })
    // 420 + 610 kcal, 25 + 35 minutes. Thousands separator is locale-dependent.
    await waitFor(() => expect(totals).toHaveTextContent(/1[,.\s]?030/))
    expect(totals).toHaveTextContent(/1 h/)
    // Nothing is missing, so no denominator is offered.
    expect(totals).not.toHaveTextContent(/of 2 meals/i)
  })

  it('shows its denominator and names the dish when a calorie figure is missing', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubDetails([
      makeRecipe({ id: 'recipe-shakshuka', title: 'Shakshuka', caloriesPerServing: 420, totalTimeMinutes: 25 }),
      makeRecipe({ id: 'recipe-corn', title: 'Charred corn salad', caloriesPerServing: null, totalTimeMinutes: 35 }),
    ])

    renderRoute('/plan/2026-07-29')

    const totals = await screen.findByRole('region', { name: /totals for this day/i })
    await waitFor(() => expect(totals).toHaveTextContent(/from 1 of 2 meals/i))
    expect(totals).toHaveTextContent(/charred corn salad has no calorie figure/i)
    // Time is complete even though calories are not — separate denominators.
    expect(totals).toHaveTextContent(/1 h/)
  })

  it('stays out of the way on a day with nothing planned', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)

    renderRoute('/plan/2026-07-29')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add a recipe for dinner/i })).toBeEnabled(),
    )
    expect(screen.queryByRole('region', { name: /totals for this day/i })).not.toBeInTheDocument()
  })
})

// stream I (D12's second surface). The ribbon's own cases live in
// DayNutritionRibbon.test.tsx; what matters HERE is the pairing — that the
// computed figure arrives beside the author-typed one and never in place of it.
describe('the computed nutrition ribbon on the day page', () => {
  beforeEach(resetPerTest)

  it('sits beside the typed totals without replacing them', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubDetails([
      makeRecipe({ id: 'recipe-shakshuka', title: 'Shakshuka', caloriesPerServing: 420, totalTimeMinutes: 25 }),
      makeRecipe({ id: 'recipe-corn', title: 'Charred corn salad', caloriesPerServing: 610, totalTimeMinutes: 35 }),
    ])
    vi.spyOn(planNutrition, 'getMealPlanNutrition').mockResolvedValue({
      mealPlanId: PLAN_ID,
      days: [
        {
          dayOfWeek: 'Wednesday',
          entryCount: 2,
          kcal: 1180,
          proteinG: 44.2,
          fatG: 30.1,
          carbsG: 120.4,
          fibreG: 9.5,
          coveredLines: 4,
          totalLines: 4,
          isSufficientlyCovered: true,
        },
      ],
    })

    renderRoute('/plan/2026-07-29')

    // The authors said 1,030 between them...
    const totals = await screen.findByRole('region', { name: /totals for this day/i })
    await waitFor(() => expect(totals).toHaveTextContent(/1[,.\s]?030/))

    // ...and the ingredients add up to 1,180. Both are on the page, and the
    // disagreement between them is the interesting part — not a bug to hide.
    const computed = await screen.findByRole('region', { name: /computed nutrition for this day/i })
    expect(computed).toHaveTextContent(/1[,.\s]?180/)
    expect(computed).toHaveTextContent(/from the ingredients/i)
    expect(computed).toHaveTextContent(/computed from all 4 ingredient lines/i)
  })

  it('is absent on a day with nothing planned', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(null)
    const fetcher = vi.spyOn(planNutrition, 'getMealPlanNutrition')

    renderRoute('/plan/2026-07-29')

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add a recipe for dinner/i })).toBeEnabled(),
    )
    expect(
      screen.queryByRole('region', { name: /computed nutrition for this day/i }),
    ).not.toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('repeat tomorrow', () => {
  beforeEach(resetPerTest)

  it("puts the same dish in tomorrow's matching slot", async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubDetails([shakshuka, cornSalad])
    const add = vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-tomorrow',
      dayOfWeek: 'Thursday',
      mealType: 'Breakfast',
      recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
    })

    renderRoute('/plan/2026-07-29')

    const button = await screen.findByRole('button', { name: /repeat shakshuka tomorrow/i })
    await userEvent.click(button)

    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(PLAN_ID, {
        dayOfWeek: 'Thursday',
        mealType: 'Breakfast',
        recipeId: 'recipe-shakshuka',
      }),
    )
    // The undo strip has to say WHERE it went — it isn't this page any more.
    expect(await screen.findByText(/tomorrow's breakfast/i)).toBeInTheDocument()
  })

  it("creates next week's plan when tomorrow crosses the Monday", async () => {
    const sundayPlan: MealPlan = {
      id: SUNDAY_PLAN_ID,
      weekStartDate: WEEK_START,
      createdAt: WEEK_START,
      entries: [
        {
          id: 'entry-sunday',
          dayOfWeek: 'Sunday',
          mealType: 'Dinner',
          recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
        },
      ],
    }

    // Only THIS week has a plan; next week must be created.
    vi.spyOn(api, 'getMealPlanForWeek').mockImplementation(async (weekStart: string) =>
      weekStart === WEEK_START ? { ...summary, id: SUNDAY_PLAN_ID } : null,
    )
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(sundayPlan)
    stubDetails([shakshuka])
    const create = vi.spyOn(api, 'createMealPlan').mockResolvedValue({
      id: 'plan-next-week',
      weekStartDate: NEXT_WEEK_START,
      createdAt: NEXT_WEEK_START,
      entries: [],
    })
    const add = vi.spyOn(api, 'addMealPlanEntry').mockResolvedValue({
      id: 'entry-monday',
      dayOfWeek: 'Monday',
      mealType: 'Dinner',
      recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
    })

    renderRoute('/plan/2026-08-02')

    const button = await screen.findByRole('button', { name: /repeat shakshuka tomorrow/i })
    await userEvent.click(button)

    await waitFor(() => expect(create).toHaveBeenCalledWith(NEXT_WEEK_START))
    expect(add).toHaveBeenCalledWith('plan-next-week', {
      dayOfWeek: 'Monday',
      mealType: 'Dinner',
      recipeId: 'recipe-shakshuka',
    })
  })

  it('refuses to overwrite a slot that tomorrow already has', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    stubDetails([shakshuka, cornSalad])
    vi.spyOn(api, 'addMealPlanEntry').mockRejectedValue(new client.ApiConflictError('Slot taken'))

    renderRoute('/plan/2026-07-29')

    await userEvent.click(await screen.findByRole('button', { name: /repeat shakshuka tomorrow/i }))

    expect(await screen.findByText(/tomorrow's breakfast is already planned/i)).toBeInTheDocument()
  })
})

// ── "I cooked this" (open-loops slice 1) ──────────────────────────────────
// The clock is pinned to Wed 29 July 2026, so /plan/2026-07-29 is TODAY and
// /plan/2026-07-31 is the future.

describe('logging a cook from the day page', () => {
  beforeEach(resetPerTest)

  /** stubDetails, plus the cook-log write routed by path and recorded. */
  function stubWithCooked(bodies: unknown[]) {
    vi.spyOn(client, 'apiFetch').mockImplementation(((
      path: string,
      init?: { method?: string; body?: unknown },
    ) => {
      if (path === '/recipes') {
        return Promise.resolve({ items: [shakshuka, cornSalad], nextCursor: null })
      }
      if (path === '/cook-log' && init?.method === 'POST') {
        bodies.push(init.body)
        return Promise.resolve({
          id: 'cook-1',
          recipeId: 'recipe-shakshuka',
          recipeTitle: 'Shakshuka',
          mealPlanEntryId: 'entry-breakfast',
          cookedAt: '2026-07-29T12:00:00.000Z',
          recipeAvailable: true,
        })
      }
      const hit = [shakshuka, cornSalad].find((recipe) => path === `/recipes/${recipe.id}`)
      return Promise.resolve(hit ?? undefined)
    }) as unknown as typeof client.apiFetch)
  }

  // The reply carries no running count any more (CookLogEntry has no
  // timesCooked) — re-deriving one client-side would be a guess, so the
  // message just confirms the log and the plan-entry id rides in the body,
  // which is what lets the shopping list resolve this specific slot.
  it('logs the cook against the plan entry', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    const bodies: unknown[] = []
    stubWithCooked(bodies)

    renderRoute('/plan/2026-07-29')

    await userEvent.click(await screen.findByRole('button', { name: /mark shakshuka as cooked/i }))

    expect(await screen.findByText(/^logged Shakshuka\.$/i)).toBeInTheDocument()
    expect(bodies).toEqual([{ recipeId: 'recipe-shakshuka', mealPlanEntryId: 'entry-breakfast' }])
  })

  it('is not offered on a future day — you have not cooked it yet', async () => {
    const futurePlan: MealPlan = {
      ...plan,
      entries: [
        {
          id: 'entry-friday',
          dayOfWeek: 'Friday',
          mealType: 'Dinner',
          recipe: { id: 'recipe-corn', title: 'Charred corn salad', imageUrl: null, totalTimeMinutes: 30 },
        },
      ],
    }
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(futurePlan)
    stubDetails([shakshuka, cornSalad])

    renderRoute('/plan/2026-07-31')

    // The dish is in Friday's dinner slot. Scoped, because the title also
    // appears in the day's ingredient list — an unscoped query matches twice —
    // and re-queried inside waitFor, because filling the slot swaps the node.
    await waitFor(() => {
      const dinner = screen.getByTestId('day-slot-Dinner')
      expect(within(dinner).getByText('Charred corn salad')).toBeInTheDocument()
    })
    // …but the cook log is not offered for it, while Swap still is.
    const dinner = screen.getByTestId('day-slot-Dinner')
    expect(within(dinner).getByRole('button', { name: /swap/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /as cooked/i })).not.toBeInTheDocument()
  })

  it('surfaces a failed log instead of pretending it worked', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(plan)
    vi.spyOn(client, 'apiFetch').mockImplementation(((path: string, init?: { method?: string }) => {
      if (path === '/recipes') {
        return Promise.resolve({ items: [shakshuka, cornSalad], nextCursor: null })
      }
      if (path === '/cook-log' && init?.method === 'POST') return Promise.reject(new Error('nope'))
      const hit = [shakshuka, cornSalad].find((recipe) => path === `/recipes/${recipe.id}`)
      return Promise.resolve(hit ?? undefined)
    }) as unknown as typeof client.apiFetch)

    renderRoute('/plan/2026-07-29')

    await userEvent.click(await screen.findByRole('button', { name: /mark shakshuka as cooked/i }))

    expect(await screen.findByText(/couldn't log that/i)).toBeInTheDocument()
  })
})

// ── The cook toggle's undo (cooked-per-plan-entry, Task 6) ─────────────────
// The clock is still pinned to Wed 29 July 2026 (see NOW above): Mon 27 July is
// a PAST day, and Fri 31 July is a FUTURE one — both inside the fixture week
// (WEEK_START), so the plan/summary stubs above still apply.

describe('the cook toggle on an already-cooked entry', () => {
  beforeEach(resetPerTest)

  /** stubDetails, plus the un-cook DELETE routed by path and recorded. */
  function stubWithUncook(uncookCalls: string[]) {
    vi.spyOn(client, 'apiFetch').mockImplementation(((path: string, init?: { method?: string }) => {
      if (path === '/recipes') {
        return Promise.resolve({ items: [shakshuka, cornSalad], nextCursor: null })
      }
      if (path.startsWith('/cook-log/entries/') && init?.method === 'DELETE') {
        uncookCalls.push(path.replace('/cook-log/entries/', ''))
        // KAN-18: a 200 carrying the dish's state, not the 204 this used to be —
        // the slot's only cook is going, so the recipe comes back un-cooked and
        // the client has something to patch its social caches with.
        return Promise.resolve({
          recipes: [
            {
              recipeId: 'recipe-shakshuka',
              timesCooked: 0,
              rating: null,
              lastCookedAt: null,
              cookedByMe: false,
            },
          ],
        })
      }
      const hit = [shakshuka, cornSalad].find((recipe) => path === `/recipes/${recipe.id}`)
      return Promise.resolve(hit ?? undefined)
    }) as unknown as typeof client.apiFetch)
  }

  const cookedPastPlan: MealPlan = {
    ...plan,
    entries: [
      {
        id: 'entry-1',
        dayOfWeek: 'Monday',
        mealType: 'Dinner',
        recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
        cookedAt: '2026-07-27T18:00:00.000Z',
      },
    ],
  }

  const cookedFuturePlan: MealPlan = {
    ...plan,
    entries: [
      {
        id: 'entry-1',
        dayOfWeek: 'Friday',
        mealType: 'Dinner',
        recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
        cookedAt: '2026-07-31T18:00:00.000Z',
      },
    ],
  }

  // KAN-8: the same slot, but somebody wrote a note against one of its cooks.
  const notedPastPlan: MealPlan = {
    ...plan,
    entries: [
      {
        id: 'entry-1',
        dayOfWeek: 'Monday',
        mealType: 'Dinner',
        recipe: { id: 'recipe-shakshuka', title: 'Shakshuka', imageUrl: null, totalTimeMinutes: 30 },
        cookedAt: '2026-07-27T18:00:00.000Z',
        cookNoteCount: 1,
      },
    ],
  }

  it('shows a cooked meal as settled and un-cooks it on tap', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(cookedPastPlan)
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    renderRoute('/plan/2026-07-27')

    // The settled state, not just any "cooked" substring: the accent button
    // itself, named for undo — a loose findByText(/cooked/i) would still pass
    // if the mark button were showing beside it.
    expect(await screen.findByRole('button', { name: /undo cooked for/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /mark .* as cooked/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /undo cooked for/i }))
    await waitFor(() => expect(uncookCalls).toEqual(['entry-1']))
  })

  // A cooked state can legitimately appear on a future day: cook mode can log
  // one ahead of time. Marking stays gated to past-or-today (offering it for
  // next Thursday's dinner is asking the user to lie); the undo is not, because
  // an undo the user cannot reach is the trust bug this roadmap exists to fix.
  //
  // This clicks the button rather than merely asserting it renders: a disabled
  // button (MealCard renders disabled={!onUncook}) still satisfies a role query
  // and toBeInTheDocument() — the click, and the DELETE it must produce, is what
  // actually pins REACHABILITY rather than mere presence.
  it('keeps the undo reachable on a future day while hiding the mark action', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(cookedFuturePlan)
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    renderRoute('/plan/2026-07-31')

    const undoButton = await screen.findByRole('button', { name: /undo cooked for/i })
    expect(screen.queryByRole('button', { name: /mark .* as cooked/i })).not.toBeInTheDocument()

    await userEvent.click(undoButton)
    await waitFor(() => expect(uncookCalls).toEqual(['entry-1']))
  })

  // ── KAN-8: un-cooking never silently destroys a note ─────────────────────
  // Un-ticking deletes every cook against the slot, notes included. The toggle
  // stays a one-tap reversible gesture when there is nothing to lose, and asks
  // exactly once there is — a dialog on every un-tick would wreck the gesture.

  it('asks before un-cooking a slot whose cooks carry a note, and names what would go', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(notedPastPlan)
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    renderRoute('/plan/2026-07-27')

    await userEvent.click(await screen.findByRole('button', { name: /undo cooked for/i }))

    // The dialog names the note as the thing at stake, and the dish it belongs
    // to — "are you sure?" over a gesture that reads as un-ticking a checkbox
    // tells the user nothing about what they are about to lose. getAllByText
    // because the copy legitimately says "note" more than once (the sentence and
    // the button); this asserts the subject, not the wording.
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText(/note/i).length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/shakshuka/i).length).toBeGreaterThan(0)

    // …and nothing has been deleted while it is open. This is the assertion the
    // whole ticket is about: asking after the fact is not asking.
    expect(uncookCalls).toEqual([])
  })

  it('leaves the cooks and their notes alone when the confirmation is cancelled', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(notedPastPlan)
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    renderRoute('/plan/2026-07-27')

    await userEvent.click(await screen.findByRole('button', { name: /undo cooked for/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /keep/i }))

    // Dismissed, no delete, and the meal still reads as cooked — cancelling is
    // not a slower yes.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(uncookCalls).toEqual([])
    expect(screen.getByRole('button', { name: /undo cooked for/i })).toBeInTheDocument()
  })

  it('un-cooks once the confirmation is accepted', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue(notedPastPlan)
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    renderRoute('/plan/2026-07-27')

    await userEvent.click(await screen.findByRole('button', { name: /undo cooked for/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /delete/i }))

    await waitFor(() => expect(uncookCalls).toEqual(['entry-1']))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /**
   * Invalidating the plan cache when a note is saved marks the query stale; it
   * does not make the rendered count true. React Query serves the cached entries
   * immediately and refetches in the background, so there is a window — after
   * writing a note in /plan's card, tapping straight through to the day — where
   * the page is showing cookNoteCount 0 while the real answer is on its way.
   * Tapping "✓ Cooked" in that window would delete the note with no dialog,
   * which is the ticket's failure with a smaller window rather than a fixed one.
   *
   * So the toggle must decide on data it knows is settled: while a refetch is in
   * flight it waits for the answer instead of trusting what it has.
   *
   * The second read is held OPEN deliberately. Letting it resolve on its own
   * makes the test pass against the un-guarded page too — the refetch simply
   * lands before userEvent finishes its microtasks, and the assertion then
   * proves nothing. Holding it open is what puts the click genuinely inside the
   * window: the page has a stale 0 rendered, the true answer is still in the
   * air, and only a toggle that waits can get this right.
   */
  it('waits for an in-flight plan refetch before deciding, instead of trusting a cached count', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    let releaseFresh: (plan: MealPlan) => void = () => {}
    const freshRead = new Promise<MealPlan>((resolve) => {
      releaseFresh = resolve
    })
    const getPlan = vi
      .spyOn(api, 'getMealPlan')
      .mockResolvedValueOnce(cookedPastPlan) // stale: no note recorded yet
      .mockReturnValue(freshRead) // fresh: the note the user just wrote, still in flight
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderRoute('/plan/2026-07-27', { client })

    const undo = await screen.findByRole('button', { name: /undo cooked for/i })
    await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(1))

    // The note lands while the day is on screen — the same invalidation
    // useCookLog.saveNote fires, which puts a refetch in flight under the
    // already-rendered (stale) count.
    void client.invalidateQueries({ queryKey: queryKeys.mealPlans.all })
    await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2))

    await userEvent.click(undo)

    // Nothing has gone out while the answer is unknown. This is the assertion
    // the un-guarded page fails: it would have read the cached 0 and deleted.
    expect(uncookCalls).toEqual([])

    releaseFresh(notedPastPlan)

    // Asked, not deleted: the toggle decided on the refetched answer.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(uncookCalls).toEqual([])
  })

  // The other half of the rule, and the one a confirmation dialog is most likely
  // to break by accident: a cooked slot nobody annotated must stay ONE TAP. The
  // existing "un-cooks it on tap" test above proves the DELETE still fires on
  // cookedPastPlan (cookNoteCount absent); this pins that no dialog appears on
  // the way — otherwise a stray dialog would satisfy that test too, since its
  // click would be answered by nothing and the DELETE never sent.
  it('does not ask when the slot has no notes to lose', async () => {
    vi.spyOn(api, 'getMealPlanForWeek').mockResolvedValue(summary)
    vi.spyOn(api, 'getMealPlan').mockResolvedValue({
      ...cookedPastPlan,
      entries: [{ ...cookedPastPlan.entries[0], cookNoteCount: 0 }],
    })
    const uncookCalls: string[] = []
    stubWithUncook(uncookCalls)

    renderRoute('/plan/2026-07-27')

    await userEvent.click(await screen.findByRole('button', { name: /undo cooked for/i }))

    await waitFor(() => expect(uncookCalls).toEqual(['entry-1']))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
