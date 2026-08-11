import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as client from '@/api/client'
import * as cookedApi from '@/api/cooked'
import * as social from '@/api/social'
import * as mealPlans from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'

// KAN-6 — "Add a cook" on /cooked, exercised through the page it lives on.
//
// The assertions that matter are about the REQUEST, not the rendering: what this
// flow is for is turning a day the user tapped into the right instant on the
// wire, and every way of getting that wrong still produces a plausible-looking
// screen.

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

/**
 * Deliberately NOT saved and NOT the caller's own — a public recipe of someone
 * else's, reachable only through the picker's "All" lens. That is the dish this
 * whole feature exists for, and a picker searching a saved-only corpus could not
 * find it.
 */
const stranger = makeRecipe({ id: 'r-menemen', title: 'Menemen' })
const saved = makeRecipe({ id: 'r-orzo', title: 'Lemon orzo' })

let apiFetch: ReturnType<typeof vi.spyOn>

function stubEverything() {
  vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({ items: [], nextCursor: null })
  vi.spyOn(social, 'getSavedRecipes').mockResolvedValue({ items: [saved], nextCursor: null })
  vi.spyOn(mealPlans, 'getMealPlans').mockResolvedValue({ items: [], nextCursor: null })

  apiFetch = vi.spyOn(client, 'apiFetch').mockImplementation(((path: string) => {
    if (path === '/recipes' || path === '/recipes/mine') {
      return Promise.resolve({ items: path === '/recipes' ? [stranger, saved] : [], nextCursor: null })
    }
    if (path === '/cook-log') {
      return Promise.resolve({
        id: 'cook-1',
        recipeId: stranger.id,
        recipeTitle: stranger.title,
        recipeImageUrl: null,
        mealPlanEntryId: null,
        cookedAt: '2026-03-05T12:00:00.000Z',
        note: null,
        recipeAvailable: true,
      })
    }
    return Promise.resolve({ items: [], nextCursor: null })
  }) as typeof client.apiFetch)
}

/** Walks the picker to `title` and lands on the "when" step. */
async function pick(user: ReturnType<typeof userEvent.setup>, title: string) {
  await user.click(await screen.findByRole('button', { name: 'Add a cook' }))
  // "All" is the lens that reaches a recipe the user has neither saved nor
  // written — the case the ticket calls out by name.
  await user.click(await screen.findByRole('tab', { name: /^All/ }))
  await user.click(await screen.findByRole('button', { name: title }))
}

function bodyOfCookLogPost(): Record<string, unknown> {
  const calls = apiFetch.mock.calls as [string, { method?: string; body?: Record<string, unknown> }?][]
  const call = calls.find(([path, init]) => path === '/cook-log' && init?.method === 'POST')
  expect(call, 'expected a POST /cook-log').toBeTruthy()
  return call![1]!.body!
}

const originalTz = process.env.TZ

describe('Add a cook', () => {
  beforeEach(() => {
    // Pinned WEST of Greenwich on purpose. At 09:00 UTC, Honolulu (UTC-10) is
    // still on the 10th — so the local day and the UTC day genuinely differ, and
    // the "defaults to today" test below can tell which one the panel used.
    // Without a pin, that test asserts a date the host's own zone decides, and
    // it would fail on any machine at UTC-10 or further west.
    process.env.TZ = 'Pacific/Honolulu'
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-08-11T09:00:00.000Z'))
    stubEverything()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    process.env.TZ = originalTz
  })

  it('sends the chosen day as midday UTC', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderRoute('/cooked')

    await pick(user, 'Menemen')

    const day = await screen.findByLabelText('Day')
    await user.clear(day)
    await user.type(day, '2026-03-05')
    await user.click(screen.getByRole('button', { name: 'Add cook' }))

    await waitFor(() => expect(bodyOfCookLogPost().recipeId).toBe('r-menemen'))

    // Midday, not midnight and not the local-midnight-in-UTC that every naive
    // date conversion produces. A cook filed twelve hours early is filed on the
    // wrong DAY for half the planet, which is the one thing this feature cannot
    // get wrong and still be worth having.
    expect(bodyOfCookLogPost().cookedAt).toBe('2026-03-05T12:00:00.000Z')
  })

  it('opens on the lens that reaches recipes the user never saved', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderRoute('/cooked')

    await user.click(await screen.findByRole('button', { name: 'Add a cook' }))

    // The planner opens this picker on a personal lens, which is right when you
    // are deciding what to eat next. Here it is exactly wrong: the dish being
    // recorded is one Cooked does not have, and often one the user never saved,
    // so a personal lens hides it behind a tab they have to think to press.
    expect(await screen.findByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
    // And it really is showing a stranger's public recipe, not an empty list.
    expect(await screen.findByRole('button', { name: 'Menemen' })).toBeInTheDocument()
  })

  it('sends a note written alongside the date', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderRoute('/cooked')

    await pick(user, 'Menemen')
    await user.type(await screen.findByLabelText(/Note/), 'too much pul biber')
    await user.click(screen.getByRole('button', { name: 'Add cook' }))

    // One gesture, one request. A cook created and THEN patched can half-fail
    // and leave a cook the user believes they annotated.
    await waitFor(() => expect(bodyOfCookLogPost().note).toBe('too much pul biber'))
  })

  it('defaults to today and offers no later day', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderRoute('/cooked')

    await pick(user, 'Menemen')

    const day = (await screen.findByLabelText('Day')) as HTMLInputElement
    // The 10th, not the 11th: the reader's OWN calendar day. It is still the 10th
    // in Honolulu while UTC has moved on, and someone recording tonight's dinner
    // there must not be handed tomorrow's date by default.
    expect(day.value).toBe('2026-08-10')
    // A picker that offers next week and then refuses it is a worse control than
    // one that never offered it. The server still holds the real ceiling, which is
    // wider than this by a day so that the far side of the date line still fits.
    expect(day.max).toBe('2026-08-10')
  })

  it('shows the server’s own sentence when the date is refused', async () => {
    apiFetch.mockImplementation(((path: string) => {
      if (path === '/recipes' || path === '/recipes/mine') {
        return Promise.resolve({ items: path === '/recipes' ? [stranger] : [], nextCursor: null })
      }
      if (path === '/cook-log') {
        return Promise.reject(
          new client.ApiValidationError({
            cookedAt: ['You cannot record a cook from before your account existed.'],
          }),
        )
      }
      return Promise.resolve({ items: [], nextCursor: null })
    }) as typeof client.apiFetch)

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderRoute('/cooked')

    await pick(user, 'Menemen')
    await user.click(screen.getByRole('button', { name: 'Add cook' }))

    // The server's sentence, not a generic one. "That day has not happened" and
    // "your account did not exist then" send the user to different fixes, and the
    // floor is a rule this client cannot even restate — it is never told the date
    // the account was created.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You cannot record a cook from before your account existed.',
    )
    // Still open, still holding what was typed: a refused date is a correction,
    // not a reason to make someone find the dish again.
    expect(screen.getByRole('button', { name: 'Add cook' })).toBeInTheDocument()
  })

  it('says so afterwards, because a backdated cook may land far down the list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderRoute('/cooked')

    await pick(user, 'Menemen')
    await user.click(screen.getByRole('button', { name: 'Add cook' }))

    // The confirmation is load-bearing precisely BECAUSE the list may not move:
    // a cook from two years ago sorts below the fold, so an unchanged first
    // screen is the correct outcome and looks exactly like a failed one.
    expect(await screen.findByRole('status')).toHaveTextContent('Menemen')
  })
})
