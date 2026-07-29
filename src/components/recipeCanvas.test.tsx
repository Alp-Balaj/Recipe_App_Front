// ─────────────────────────────────────────────────────────────────────────
// Opening a recipe must not navigate you off the page you were on: the canvas
// opens OVER the chat thread / feed you came from (see recipeCanvas.ts). These
// tests pin the desktop two-pane behaviour, which the mobile-by-default
// matchMedia stub in src/test/setup.ts otherwise never exercises.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { routes } from '@/router'
import { AuthContext } from '@/auth/AuthContext'
import { makeAuthValue } from '@/test/utils'
import { server } from '@/test/msw/server'
import { isRecipeDetailPath } from './recipeCanvas'
import type { RecipeResponse } from '@/api/types'

const RECIPE: RecipeResponse = {
  id: 'r1',
  title: 'Miso butter noodles',
  description: 'Deeply savoury weeknight noodles.',
  cuisineType: 'Japanese',
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  totalTimeMinutes: 15,
  servings: 2,
  difficulty: 'Easy',
  caloriesPerServing: null,
  imageUrl: null,
  visibility: 'Public',
  tags: [],
  ingredients: [],
  steps: [],
  createdByUserId: '99999999-9999-9999-9999-999999999999',
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
}

const realMatchMedia = window.matchMedia

/** Force the desktop branch of the shell (sidebar + conversation + canvas). */
function useDesktopViewport() {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('min-width: 1024px'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia
}

function renderAt(entry: InitialEntry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue()}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
  return router
}

describe('isRecipeDetailPath', () => {
  it('matches detail URLs only — /recipes/new and /recipes/mine are pages', () => {
    expect(isRecipeDetailPath('/recipes/r1')).toBe(true)
    expect(isRecipeDetailPath('/recipes/new')).toBe(false)
    expect(isRecipeDetailPath('/recipes/mine')).toBe(false)
    expect(isRecipeDetailPath('/discover')).toBe(false)
  })
})

describe('recipe canvas backdrop (desktop)', () => {
  beforeEach(() => {
    useDesktopViewport()
    server.use(http.get('*/recipes/r1', () => HttpResponse.json(RECIPE)))
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  it('keeps the page the recipe was opened from behind the canvas', async () => {
    renderAt({ pathname: '/recipes/r1', state: { backdrop: '/feed' } })

    // The canvas shows the recipe...
    expect(await screen.findByText('Miso butter noodles')).toBeInTheDocument()
    // ...over the FEED, not the browse backdrop: the feed's empty state, and
    // the Feed tab (not Discover) still reads as the current page.
    expect(await screen.findByText('Nothing cooking yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Feed' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Discover' })).not.toHaveAttribute('aria-current')
  })

  it('falls back to the library for a deep link that carries no backdrop', async () => {
    renderAt('/recipes/r1')

    expect(await screen.findByText('Miso butter noodles')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')
  })
})

// ── The day page ──────────────────────────────────────────────────────────
// Reading a planned meal is a glance mid-plan, not a departure: the recipe
// opens in the canvas and the day it belongs to stays in the pane. That needs
// BOTH halves — MealCard carrying the backdrop, and the shell knowing how to
// render /plan/:date behind the canvas.

const DAY = '2026-07-29' // a Wednesday
const WEEK_START = '2026-07-27T00:00:00.000Z'

const PLAN = {
  id: 'plan-1',
  weekStartDate: WEEK_START,
  createdAt: WEEK_START,
  entries: [
    {
      id: 'entry-dinner',
      dayOfWeek: 'Wednesday',
      mealType: 'Dinner',
      recipe: { id: 'r1', title: RECIPE.title, imageUrl: null },
    },
  ],
}

describe('recipe canvas over the day page (desktop)', () => {
  beforeEach(() => {
    useDesktopViewport()
    server.use(
      http.get('*/recipes/r1', () => HttpResponse.json(RECIPE)),
      http.get('*/meal-plans', () =>
        HttpResponse.json({
          items: [
            {
              id: PLAN.id,
              weekStartDate: WEEK_START,
              createdAt: WEEK_START,
              entryCount: 1,
              totalMinutes: 15,
            },
          ],
          nextCursor: null,
        }),
      ),
      http.get('*/meal-plans/plan-1', () => HttpResponse.json(PLAN)),
    )
  })

  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  it("keeps the day behind the canvas when a meal's Recipe button is used", async () => {
    const user = userEvent.setup()
    renderAt(`/plan/${DAY}`)

    await waitFor(() =>
      expect(within(screen.getByTestId('day-slot-Dinner')).getByText(RECIPE.title)).toBeInTheDocument(),
    )
    await user.click(within(screen.getByTestId('day-slot-Dinner')).getByRole('link', { name: 'Recipe' }))

    // The canvas holds the recipe (its description exists only on the detail
    // page — the title also appears on the meal card behind it)...
    expect(await screen.findByText('Deeply savoury weeknight noodles.')).toBeInTheDocument()
    // ...and the day is still the page under it, with the Plan tab still lit.
    await waitFor(() => expect(screen.getByTestId('day-slot-Dinner')).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: /wednesday/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Discover' })).not.toHaveAttribute('aria-current')
  })

  it('renders the day as the backdrop on a reload of that recipe URL', async () => {
    renderAt({ pathname: '/recipes/r1', state: { backdrop: `/plan/${DAY}` } })

    expect(await screen.findByText('Deeply savoury weeknight noodles.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /wednesday/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
  })
})
