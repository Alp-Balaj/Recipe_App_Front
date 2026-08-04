import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, TEST_USER } from '@/test/utils'
import type { RecipeResponse } from '@/api/types'

const RECIPE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function makeRecipe(overrides: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: RECIPE_ID,
    title: 'Miso ramen',
    description: 'A warming vegetarian broth with deep umami flavour.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'Medium',
    cuisineType: 'Japanese',
    caloriesPerServing: 420,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [
      { name: 'white miso paste', quantity: 3, unit: 'Tablespoon' },
      { name: 'ramen noodles', quantity: 150, unit: 'Gram' },
    ],
    steps: [
      { stepNumber: 1, description: 'Simmer the dashi.', timerSeconds: 300 },
      { stepNumber: 2, description: 'Whisk in the miso paste.', timerSeconds: null },
    ],
    tags: ['Comfort', 'Comfort'],
    createdByUserId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ...overrides,
  }
}

function mockDetail(recipe: RecipeResponse) {
  server.use(http.get('*/recipes/:id', () => HttpResponse.json(recipe)))
}

describe('RecipeDetailPage', () => {
  it('renders the fetched recipe — title, calories, tags and the steps section', async () => {
    mockDetail(makeRecipe())
    renderRoute(`/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()
    // Calories-only nutrition (no protein/carbs/fat macro tiles).
    expect(screen.getByText('420')).toBeInTheDocument()
    expect(screen.getByText('kcal per serving')).toBeInTheDocument()
    expect(screen.queryByText(/protein/i)).not.toBeInTheDocument()
    // Ingredients formatted from quantity + unit.
    expect(screen.getByText('3 tbsp')).toBeInTheDocument()
    // Steps section with a formatted timer.
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('Simmer the dashi.')).toBeInTheDocument()
    expect(screen.getByText('◷ 5 min')).toBeInTheDocument()
    expect(screen.getByText('Whisk in the miso paste.')).toBeInTheDocument()
  })

  it('shows the visibility badge only on the caller\'s own recipe', async () => {
    mockDetail(makeRecipe({ createdByUserId: TEST_USER.userId, visibility: 'Private' }))
    renderRoute(`/recipes/${RECIPE_ID}`)
    expect(await screen.findByText('Private')).toBeInTheDocument()
  })

  it('renders a not-found state on a 404', async () => {
    server.use(http.get('*/recipes/:id', () => new HttpResponse(null, { status: 404 })))
    renderRoute(`/recipes/${RECIPE_ID}`)
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument()
  })

  it('renders an error state (with retry) on a 500', async () => {
    server.use(http.get('*/recipes/:id', () => new HttpResponse(null, { status: 500 })))
    renderRoute(`/recipes/${RECIPE_ID}`)
    // The hook keeps the app's single retry on non-404 errors (~1s backoff),
    // so allow for that before the error state settles.
    expect(await screen.findByText("Couldn't load this recipe", undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('enters step-by-step cooking mode from Start cooking', async () => {
    mockDetail(makeRecipe())
    renderRoute(`/recipes/${RECIPE_ID}`)
    await userEvent.click(await screen.findByText('▷ Start cooking'))
    expect(await screen.findByText('Step 1 of 2')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Next →'))
    expect(await screen.findByText('Step 2 of 2')).toBeInTheDocument()
    // Last step's primary action closes the overlay.
    expect(screen.getByText('Done ✓')).toBeInTheDocument()
  })
})
