import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { renderRoute } from '@/test/utils'
import type { CreateRecipeRequest, RecipeResponse } from '@/api/types'

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
  await user.type(screen.getByLabelText('Step 1 timer in seconds'), '90')
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

    // stepNumber auto-assigned as index + 1 (never a form field).
    expect(body.steps).toEqual([
      { stepNumber: 1, description: 'Simmer the broth', timerSeconds: 90 },
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
