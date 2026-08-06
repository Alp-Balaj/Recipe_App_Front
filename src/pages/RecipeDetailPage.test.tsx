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
      {
        stepNumber: 1,
        description: 'Simmer the dashi.',
        durationSeconds: 300,
        ingredientIndexes: [],
        temperature: { value: 95, unit: 'Celsius' },
      },
      {
        stepNumber: 2,
        description: 'Whisk in the miso paste.',
        durationSeconds: null,
        // Stream J: this step consumes the SECOND ingredient line, so the page
        // renders that line's quantity beside the instruction (decision D17's
        // third answer) rather than the prose repeating it.
        ingredientIndexes: [1],
        temperature: null,
      },
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
    // Steps section with a formatted duration.
    expect(screen.getByText('Steps')).toBeInTheDocument()
    expect(screen.getByText('Simmer the dashi.')).toBeInTheDocument()
    expect(screen.getByText('◷ 5 min')).toBeInTheDocument()
    expect(screen.getByText('Whisk in the miso paste.')).toBeInTheDocument()
  })

  // ── Stream J: the typed step, as the page reads it ────────────────────────

  it("renders a step's temperature and the ingredient lines it uses", async () => {
    mockDetail(makeRecipe())
    renderRoute(`/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('◈ 95 °C')).toBeInTheDocument()

    // The referenced line's quantity is rendered FROM the ingredient list, so it
    // appears twice on the page — once in the list, once beside step 2. That is
    // the point of D17's third answer: one stored number, two renderings, and no
    // quantity baked into prose that could go stale.
    expect(screen.getAllByText('150 g')).toHaveLength(2)
    expect(screen.getAllByText('ramen noodles')).toHaveLength(2)

    // Step 1 references nothing, so the miso paste is only in the list.
    expect(screen.getAllByText('white miso paste')).toHaveLength(1)
  })

  it('ignores a step reference that points past the ingredient list', async () => {
    // The backend rejects this on both write paths, so it should be unreachable
    // — but the page also renders cached recipes that may predate an edit, and a
    // step is worth reading with one chip missing rather than crashing.
    mockDetail(
      makeRecipe({
        steps: [
          { stepNumber: 1, description: 'Fold it in.', durationSeconds: null, ingredientIndexes: [0, 9] },
        ],
      }),
    )
    renderRoute(`/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Fold it in.')).toBeInTheDocument()
    // Index 0 resolved; index 9 was skipped rather than rendered as a blank chip.
    expect(screen.getAllByText('white miso paste')).toHaveLength(2)
    expect(screen.getByText('Fold it in.').closest('li')!.textContent).toBe(
      '1Fold it in.3 tbspwhite miso paste',
    )
  })

  it('reads a step written before the model was typed', async () => {
    // Every new field is optional on the wire. A step carrying none of them must
    // render exactly as it always did — no empty meta strip, no stray chips.
    mockDetail(
      makeRecipe({ steps: [{ stepNumber: 1, description: 'Just cook it.' }] }),
    )
    renderRoute(`/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Just cook it.')).toBeInTheDocument()
    // The whole <li>, verbatim: the number badge and the prose and nothing else.
    // Asserting on the element rather than on the absence of an icon is what
    // makes this catch an EMPTY meta strip, which renders no text at all.
    expect(screen.getByText('Just cook it.').closest('li')!.textContent).toBe('1Just cook it.')
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
