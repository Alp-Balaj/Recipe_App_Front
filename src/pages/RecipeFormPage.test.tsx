import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { renderRoute } from '@/test/utils'
import type { CreateRecipeRequest, RecipeResponse } from '@/api/types'
import { remapIngredientIndexes } from './RecipeFormPage.shared'

function makeRecipeResponse(overrides: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: 'new-recipe-42',
    title: 'Saved',
    description: 'desc',
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: null,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: [],
    createdByUserId: '11111111-1111-1111-1111-111111111111',
    ...overrides,
  }
}

/** Fill the minimal set of valid fields (one ingredient + one default step). */
async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Title'), 'Miso Ramen')
  await user.type(screen.getByLabelText('Description'), 'Warming bowl')
  await user.type(screen.getByLabelText('Prep (min)'), '15')
  await user.type(screen.getByLabelText('Cook (min)'), '25')
  await user.type(screen.getByLabelText('Servings'), '2')
  await user.type(screen.getByLabelText('Ingredient 1 quantity'), '1.5')
  await user.selectOptions(screen.getByLabelText('Ingredient 1 unit'), 'Cup')
  await user.type(screen.getByLabelText('Ingredient 1 name'), 'Miso paste')
  await user.type(screen.getByLabelText('Step 1 instruction'), 'Simmer the broth')
  await user.type(screen.getByLabelText('Step 1 duration in seconds'), '90')
  // Stream G: chips, not a comma-separated field. Clicking the same chip twice
  // would DESELECT it, so the old input's "Vegan, QUICK, vegan" (which tested the
  // trim/lowercase/de-dupe the free-text field needed) has no analogue — a chip
  // cannot be selected twice.
  await user.click(screen.getByRole('checkbox', { name: 'Vegan' }))
  await user.click(screen.getByRole('checkbox', { name: 'Quick' }))
}

describe('RecipeFormPage (create)', () => {
  it('posts a normalized CreateRecipeRequest and navigates to the new detail page', async () => {
    const user = userEvent.setup()
    let captured: CreateRecipeRequest | null = null
    server.use(
      http.post('*/recipes', async ({ request }) => {
        captured = (await request.json()) as CreateRecipeRequest
        return HttpResponse.json(makeRecipeResponse(), { status: 201 })
      }),
    )

    const router = renderRoute('/recipes/new')
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    await vi.waitFor(() => expect(captured).not.toBeNull())
    const body = captured as unknown as CreateRecipeRequest

    // stepNumber auto-assigned as index + 1 (never a form field). Stream J: every
    // typed field travels on every step, with the "this step has none" answers
    // written out — an empty array and a null, not omitted keys.
    expect(body.steps).toEqual([
      {
        stepNumber: 1,
        description: 'Simmer the broth',
        durationSeconds: 90,
        ingredientIndexes: [],
        temperature: null,
      },
    ])
    // Sent verbatim as vocabulary members, and in TAG_GROUPS order rather than
    // click order — Quick sits in "Occasion", ahead of Vegan in "Diet & character".
    expect(body.tags).toEqual(['Quick', 'Vegan'])
    // Numeric coercion.
    expect(body.prepTimeMinutes).toBe(15)
    expect(body.servings).toBe(2)
    expect(body.ingredients).toEqual([{ name: 'Miso paste', quantity: 1.5, unit: 'Cup' }])
    // Blank optionals become null, not '' or 0.
    expect(body.caloriesPerServing).toBeNull()
    expect(body.cuisineType).toBeNull()
    expect(body.imageUrl).toBeNull()

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/recipes/new-recipe-42'))
  })

  it('blocks submission client-side (zod) and never calls the API', async () => {
    const user = userEvent.setup()
    const postSpy = vi.fn()
    server.use(
      http.post('*/recipes', () => {
        postSpy()
        return HttpResponse.json(makeRecipeResponse(), { status: 201 })
      }),
    )

    renderRoute('/recipes/new')
    await user.click(await screen.findByRole('button', { name: /publish recipe/i }))

    expect(await screen.findByText('Title is required')).toBeInTheDocument()
    expect(screen.getByText('Description is required')).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()
  })

  it('maps a server 400 ValidationProblem (PascalCase paths) onto the fields', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/recipes', () =>
        HttpResponse.json(
          {
            title: 'Validation failed',
            status: 400,
            errors: {
              Title: ['Server says the title is off'],
              'Ingredients[0].Name': ['Unknown ingredient'],
            },
          },
          { status: 400 },
        ),
      ),
    )

    renderRoute('/recipes/new')
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    // "Title" → title field; "Ingredients[0].Name" → ingredients.0.name field.
    expect(await screen.findByText('Server says the title is off')).toBeInTheDocument()
    expect(screen.getByText('Unknown ingredient')).toBeInTheDocument()
  })

  // open-loops slice 1. The account setting has been stored and editable since
  // the account-settings work while this form hardcoded Public, so picking
  // "Private by default" silently did nothing.
  it("seeds visibility from the author's default-visibility setting", async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(makeUserProfile({ defaultRecipeVisibility: 'Private' })),
      ),
    )

    renderRoute('/recipes/new')

    const select = await screen.findByLabelText('Visibility')
    await waitFor(() => expect(select).toHaveValue('Private'))
  })

  it('does not clobber a visibility the user already chose', async () => {
    const user = userEvent.setup()
    // The preference lands well after the user has made their own choice.
    server.use(
      http.get('*/users/:id', async () => {
        await delay(300)
        return HttpResponse.json(makeUserProfile({ defaultRecipeVisibility: 'Private' }))
      }),
    )

    renderRoute('/recipes/new')

    const select = await screen.findByLabelText('Visibility')
    await user.selectOptions(select, 'FriendsOnly')
    await user.type(screen.getByLabelText(/^title/i), 'Deliberately friends-only')

    // The late preference must not overwrite a form the user is working in —
    // applying it here would silently change who can see what they are writing.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(select).toHaveValue('FriendsOnly')
    expect(screen.getByLabelText(/^title/i)).toHaveValue('Deliberately friends-only')
  })
})

// ── Stream J: the typed step editor ──────────────────────────────────────────

describe('remapIngredientIndexes (decision D16)', () => {
  it('drops references to the removed line and shifts the ones above it down', () => {
    expect(remapIngredientIndexes([0, 1, 2], 1)).toEqual([0, 1])
    expect(remapIngredientIndexes([2], 0)).toEqual([1])
    expect(remapIngredientIndexes([0], 2)).toEqual([0])
    expect(remapIngredientIndexes([], 0)).toEqual([])
  })
})

describe('RecipeFormPage — typed steps (stream J)', () => {
  /** Two ingredients and one step, with the step wired to the SECOND ingredient. */
  async function fillTwoIngredientForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('Title'), 'Miso Ramen')
    await user.type(screen.getByLabelText('Description'), 'Warming bowl')
    await user.type(screen.getByLabelText('Prep (min)'), '15')
    await user.type(screen.getByLabelText('Cook (min)'), '25')
    await user.type(screen.getByLabelText('Servings'), '2')

    await user.type(screen.getByLabelText('Ingredient 1 quantity'), '1.5')
    await user.type(screen.getByLabelText('Ingredient 1 name'), 'Miso paste')
    await user.click(screen.getByRole('button', { name: '+ Add ingredient' }))
    await user.type(screen.getByLabelText('Ingredient 2 quantity'), '2')
    await user.type(screen.getByLabelText('Ingredient 2 name'), 'Noodles')

    await user.type(screen.getByLabelText('Step 1 instruction'), 'Cook the noodles')
  }

  function captureCreate(): { body: CreateRecipeRequest | null } {
    const captured: { body: CreateRecipeRequest | null } = { body: null }
    server.use(
      http.post('*/recipes', async ({ request }) => {
        captured.body = (await request.json()) as CreateRecipeRequest
        return HttpResponse.json(makeRecipeResponse(), { status: 201 })
      }),
    )
    return captured
  }

  it('sends the chosen ingredient references, the duration and the temperature', async () => {
    const user = userEvent.setup()
    const captured = captureCreate()

    renderRoute('/recipes/new')
    await fillTwoIngredientForm(user)

    const uses = screen.getByRole('group', { name: 'Ingredients used in step 1' })
    await user.click(within(uses).getByRole('button', { name: 'Noodles' }))
    await user.type(screen.getByLabelText('Step 1 duration in seconds'), '180')
    await user.type(screen.getByLabelText('Step 1 temperature'), '180')

    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    await vi.waitFor(() => expect(captured.body).not.toBeNull())
    expect(captured.body!.steps[0]).toEqual({
      stepNumber: 1,
      description: 'Cook the noodles',
      durationSeconds: 180,
      ingredientIndexes: [1],
      temperature: { value: 180, unit: 'Celsius' },
    })
  })

  // THE decision-D16 hazard, end to end. Removing an ingredient line renumbers
  // every line after it, and a step still pointing at the old position would
  // silently attach the WRONG ingredient — or, once the backend rule lands, 400
  // on a recipe the author has no way to understand.
  it('remaps a step reference when the ingredient above it is deleted', async () => {
    const user = userEvent.setup()
    const captured = captureCreate()

    renderRoute('/recipes/new')
    await fillTwoIngredientForm(user)

    const uses = screen.getByRole('group', { name: 'Ingredients used in step 1' })
    await user.click(within(uses).getByRole('button', { name: 'Noodles' }))
    // Miso paste goes; "Noodles" slides from index 1 to index 0.
    await user.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))

    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    await vi.waitFor(() => expect(captured.body).not.toBeNull())
    expect(captured.body!.ingredients).toEqual([{ name: 'Noodles', quantity: 2, unit: 'Gram' }])
    expect(captured.body!.steps[0].ingredientIndexes).toEqual([0])
  })

  it('drops a reference to the ingredient line that was deleted', async () => {
    const user = userEvent.setup()
    const captured = captureCreate()

    renderRoute('/recipes/new')
    await fillTwoIngredientForm(user)

    const uses = screen.getByRole('group', { name: 'Ingredients used in step 1' })
    await user.click(within(uses).getByRole('button', { name: 'Miso paste' }))
    await user.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))

    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    await vi.waitFor(() => expect(captured.body).not.toBeNull())
    expect(captured.body!.steps[0].ingredientIndexes).toEqual([])
  })

  // Mirrors RecipeStepRules' per-unit bounds: 400 is an ordinary oven in
  // Fahrenheit and a kiln in Celsius, so the same number must be accepted under
  // one scale and refused under the other — without a round trip.
  it('refuses an implausible temperature for its scale before calling the API', async () => {
    const user = userEvent.setup()
    const postSpy = vi.fn()
    server.use(
      http.post('*/recipes', () => {
        postSpy()
        return HttpResponse.json(makeRecipeResponse(), { status: 201 })
      }),
    )

    renderRoute('/recipes/new')
    await fillTwoIngredientForm(user)
    await user.type(screen.getByLabelText('Step 1 temperature'), '400')
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    expect(await screen.findByText('Between -40 and 300 °C')).toBeInTheDocument()
    expect(postSpy).not.toHaveBeenCalled()

    // The same 400 under Fahrenheit is fine, and the error clears.
    await user.selectOptions(screen.getByLabelText('Step 1 temperature unit'), 'Fahrenheit')
    await user.click(screen.getByRole('button', { name: /publish recipe/i }))

    await vi.waitFor(() => expect(postSpy).toHaveBeenCalled())
  })
})
