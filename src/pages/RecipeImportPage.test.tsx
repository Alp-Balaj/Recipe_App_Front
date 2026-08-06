import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, TEST_USER } from '@/test/utils'
import { sourceDomain } from '@/api/import'
import type { RecipeResponse } from '@/api/types'

// ─────────────────────────────────────────────────────────────────────────
// /recipes/import — stream L.
//
// The assertions worth having are about what a FAILED import tells the user,
// not about the happy path. Import is the one surface in this app that fails
// for reasons the user can act on — a page that is not a recipe, a site that
// is down, a photo of a dinner rather than of a recipe — and the whole reason
// api/import.ts has its own fetch path is to keep the server's sentence
// instead of flattening it to "import failed". A regression there is silent
// and leaves people re-pasting links that were never going to work.
// ─────────────────────────────────────────────────────────────────────────

const RECIPE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function importedRecipe(overrides: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: RECIPE_ID,
    title: 'Butter Beans on Toast',
    description: 'A fast supper.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'Medium',
    cuisineType: 'British',
    caloriesPerServing: 420,
    imageUrl: null,
    visibility: 'Private',
    createdAt: '2026-08-06T00:00:00Z',
    updatedAt: null,
    ingredients: [{ name: 'butter beans', quantity: 400, unit: 'Gram' }],
    steps: [{ stepNumber: 1, description: 'Warm the beans.', durationSeconds: null, ingredientIndexes: [0], temperature: null }],
    tags: [],
    createdByUserId: TEST_USER.userId,
    isAiGenerated: false,
    sourceConversationId: null,
    sourceUrl: 'https://www.example.test/butter-beans',
    ...overrides,
  } as RecipeResponse
}

function respondWith(status: number, body: Record<string, unknown>) {
  server.use(
    http.post('/api/recipes/import/url', () => HttpResponse.json(body, { status })),
  )
}

async function typeUrlAndSubmit(user: ReturnType<typeof userEvent.setup>, url = 'https://example.test/r') {
  await user.type(await screen.findByLabelText('Recipe address'), url)
  await user.click(screen.getByRole('button', { name: 'Import recipe' }))
}

describe('RecipeImportPage', () => {
  it('imports a URL and leaves for the new recipe', async () => {
    const user = userEvent.setup()
    let captured: unknown = null
    server.use(
      http.post('/api/recipes/import/url', async ({ request }) => {
        captured = await request.json()
        return HttpResponse.json(
          { recipe: importedRecipe(), source: 'structuredData', budget: null },
          { status: 201 },
        )
      }),
    )

    const router = renderRoute('/recipes/import')
    await typeUrlAndSubmit(user, 'https://example.test/butter-beans')

    await waitFor(() => expect(router.state.location.pathname).toBe(`/recipes/${RECIPE_ID}`))
    expect(captured).toEqual({ url: 'https://example.test/butter-beans' })
  })

  // D15, told to the user before they import rather than discovered afterwards.
  it('says up front that imports are saved privately', async () => {
    renderRoute('/recipes/import')

    expect(await screen.findByText(/saved privately/i)).toBeTruthy()
  })

  // ── The failure surface ──────────────────────────────────────────────────

  // 422: the fetch worked and there was no recipe there. The server's own
  // sentence is what tells the user that re-pasting will not help.
  it('shows the server’s reason when a page has no recipe on it', async () => {
    const user = userEvent.setup()
    respondWith(422, {
      title: 'No recipe could be read from that source.',
      detail: 'No ingredients could be read from the source.',
    })

    renderRoute('/recipes/import')
    await typeUrlAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No ingredients could be read from the source.',
    )
  })

  // 502 about somebody else's server. Same rule: the specific reason survives.
  it('shows the server’s reason when a page cannot be fetched', async () => {
    const user = userEvent.setup()
    respondWith(502, {
      title: 'That page could not be fetched.',
      detail: 'That page is too large to import.',
    })

    renderRoute('/recipes/import')
    await typeUrlAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent('That page is too large to import.')
  })

  // 400 arrives as a ValidationProblem keyed on the field, not as `detail`.
  it('shows the field message when the address is refused', async () => {
    const user = userEvent.setup()
    respondWith(400, {
      title: 'One or more validation errors occurred.',
      errors: { url: ['That address is not publicly reachable.'] },
    })

    renderRoute('/recipes/import')
    await typeUrlAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That address is not publicly reachable.',
    )
  })

  // 429 gets our copy rather than the server's, because "resets at midnight
  // UTC" is the actionable part and the server's title does not carry it.
  it('explains an exhausted AI budget', async () => {
    const user = userEvent.setup()
    respondWith(429, { title: 'Daily AI budget exhausted.' })

    renderRoute('/recipes/import')
    await typeUrlAndSubmit(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/today's AI allowance/i)
  })

  it('does not call the server for an empty address', async () => {
    const user = userEvent.setup()
    let called = false
    server.use(
      http.post('/api/recipes/import/url', () => {
        called = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )

    renderRoute('/recipes/import')
    await user.click(await screen.findByRole('button', { name: 'Import recipe' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(called).toBe(false)
  })

  // The photo tab exists and says what it will and will not read. "A photo of
  // the dish" is the single likeliest wrong expectation for this feature, and
  // it was cut rather than deferred — so the surface has to say so.
  it('offers a photo tab that rules out photographing the dish', async () => {
    const user = userEvent.setup()
    renderRoute('/recipes/import')

    await user.click(await screen.findByRole('tab', { name: 'Photo' }))

    expect(screen.getByText(/finished dish won't work/i)).toBeTruthy()
  })
})

describe('sourceDomain', () => {
  it('renders the host without www', () => {
    expect(sourceDomain('https://www.bbcgoodfood.com/recipes/x')).toBe('bbcgoodfood.com')
    expect(sourceDomain('https://example.test/a/b?c=d')).toBe('example.test')
  })

  // A malformed value must show NOTHING rather than a blob of raw text where
  // the reader expects an attribution they can trust.
  it('returns null for anything unusable', () => {
    expect(sourceDomain(null)).toBeNull()
    expect(sourceDomain(undefined)).toBeNull()
    expect(sourceDomain('')).toBeNull()
    expect(sourceDomain('not a url')).toBeNull()
  })
})
