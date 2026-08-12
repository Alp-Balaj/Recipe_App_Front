// KAN-7 — rating a recipe you have never recorded cooking.
//
// The server refuses that rating (409) and the recipe page answers by asking for
// the cook it needs, then finishing the rating the reader actually made. Every
// assertion here is about the WIRE and its ORDER: "the cook, then the rating"
// is the requirement, and a screen that looks right is compatible with sending
// only one of them, or sending them the wrong way round.
//
// The refusal is what opens the prompt — not anything the page believed about
// `cookedByMe`. That flag agrees with the server's rule since KAN-13, but it is
// still null on a surface that was never seeded and still patchable in flight,
// so the page is not entitled to pre-empt on it. Every test below starts from a
// page that has no idea, exactly as a reader arriving from a shared link does.

import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { RecipeSocialResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `kan7-r${idSeq}`,
    title: `Uncooked dish ${idSeq}`,
    description: 'Never made, about to be rated.',
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
    ingredients: [{ name: 'salt', quantity: 1, unit: 'Teaspoon' }],
    steps: [],
    tags: [],
    createdByUserId: 'author-1',
    ...over,
  }
}

function makeSocial(over: Partial<RecipeSocialResponse> = {}): RecipeSocialResponse {
  return {
    author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    savedByMe: false,
    averageRating: null,
    ratingCount: 0,
    cookedByMe: false,
    myRating: null,
    madeItCount: 0,
    recentMakers: [],
    ...over,
  }
}

/** Every request this flow makes, in the order the server saw them. */
interface Wire {
  calls: string[]
  cookBodies: Record<string, unknown>[]
  ratings: number[]
}

/**
 * A recipe the caller has no cook for: PUT /rating answers 409 until one lands,
 * and POST /cook-log is what makes it land. The 409-then-200 switch is the whole
 * point — a stub that always accepted would pass whether or not the client
 * bothered to record the cook first.
 */
function givenAnUncookedRecipe(social: Partial<RecipeSocialResponse> = {}): { recipe: RecipeResponse; wire: Wire } {
  const recipe = makeRecipe()
  const wire: Wire = { calls: [], cookBodies: [], ratings: [] }
  let hasACook = false

  server.use(
    http.get('*/recipes/:id', () => HttpResponse.json(recipe)),
    http.get('*/recipes/:id/social', () => HttpResponse.json(makeSocial(social))),
    http.get('*/recipes/:id/comments', () => HttpResponse.json({ items: [], nextCursor: null })),
    http.post('*/cook-log', async ({ request }) => {
      wire.calls.push('cook')
      wire.cookBodies.push((await request.json()) as Record<string, unknown>)
      hasACook = true
      return HttpResponse.json(
        {
          id: 'cook-1',
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          cookedAt: '2026-08-11T12:00:00Z',
          recipeAvailable: true,
        },
        { status: 201 },
      )
    }),
    http.put('*/recipes/:id/rating', async ({ request }) => {
      const body = (await request.json()) as { rating: number }
      if (!hasACook) {
        wire.calls.push('rating-refused')
        return HttpResponse.json({ error: 'Record a cook of this recipe before rating it.' }, { status: 409 })
      }
      wire.calls.push('rating')
      wire.ratings.push(body.rating)
      return HttpResponse.json({ recipeId: recipe.id, timesCooked: 1, rating: body.rating, cookedByMe: true })
    }),
  )

  return { recipe, wire }
}

describe('rating a recipe with no cook behind it', () => {
  it('asks for the cook, with Today as the primary action', async () => {
    const { recipe } = givenAnUncookedRecipe()
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/No ratings yet/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))

    expect(await screen.findByText('You cooked this before?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pick a date' })).toBeInTheDocument()
  })

  it('Today records a cook dated now and THEN applies the rating', async () => {
    const { recipe, wire } = givenAnUncookedRecipe()
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/No ratings yet/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Today' }))

    await waitFor(() => expect(wire.ratings).toEqual([4]))
    // The order is the requirement, not an implementation detail: the server
    // refuses the rating until the cook exists, so a rating sent first is a
    // rating lost. The refused first attempt is the reader's original tap.
    expect(wire.calls).toEqual(['rating-refused', 'cook', 'rating'])
    // "Dated now" means no date on the wire — the cook log stamps the moment.
    // Sending a day here would file tonight's dinner at midday, and would be
    // the same request the "pick a date" branch makes, which it must not be.
    expect(wire.cookBodies[0]).not.toHaveProperty('cookedAt')
  })

  it('Pick a date reuses the backdating flow and rates the dish it creates', async () => {
    const { recipe, wire } = givenAnUncookedRecipe()
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/No ratings yet/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 5' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Pick a date' }))

    // The same second step /cooked's "Add a cook" uses — reached with the dish
    // already chosen, because the reader is standing on it.
    const day = await screen.findByLabelText('Day')
    await userEvent.clear(day)
    await userEvent.type(day, '2026-08-03')
    await userEvent.click(screen.getByRole('button', { name: 'Add cook and rate' }))

    await waitFor(() => expect(wire.ratings).toEqual([5]))
    expect(wire.calls).toEqual(['rating-refused', 'cook', 'rating'])
    // Midday UTC, which is what keeps the chosen DAY intact either side of the
    // meridian — see middayUtc. Midnight in either direction is a day lost for
    // half the world's readers.
    expect(wire.cookBodies[0].cookedAt).toBe('2026-08-03T12:00:00.000Z')
  })

  it('writes neither a cook nor a rating when the prompt is dismissed', async () => {
    const { recipe, wire } = givenAnUncookedRecipe()
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/No ratings yet/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 3 out of 5' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))

    await waitFor(() => expect(screen.queryByText('You cooked this before?')).not.toBeInTheDocument())
    // Only the refused attempt reached the server, and it wrote nothing.
    expect(wire.calls).toEqual(['rating-refused'])
    // And the star the reader tapped is back off: the optimistic patch was
    // rolled back when the server refused, so the page is not showing a rating
    // that does not exist.
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('does not prompt when the dish has already been cooked — the rating just lands', async () => {
    const recipe = makeRecipe()
    const ratings: number[] = []
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(recipe)),
      http.get('*/recipes/:id/social', () =>
        HttpResponse.json(makeSocial({ cookedByMe: true, myRating: 2, averageRating: 2, ratingCount: 1 })),
      ),
      http.get('*/recipes/:id/comments', () => HttpResponse.json({ items: [], nextCursor: null })),
      http.put('*/recipes/:id/rating', async ({ request }) => {
        const body = (await request.json()) as { rating: number }
        ratings.push(body.rating)
        return HttpResponse.json({ recipeId: recipe.id, timesCooked: 3, rating: body.rating, cookedByMe: true })
      }),
    )
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/2\.0 from 1 rating/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))

    await waitFor(() => expect(ratings).toEqual([4]))
    expect(screen.queryByText('You cooked this before?')).not.toBeInTheDocument()
  })

  it('says the cook survived, and retries only the rating, when the rating fails after it', async () => {
    // The one outcome neither step of the prompt can recover on its own: the
    // cook is on the server, the rating is not, and "record the cook" — the
    // retry both steps offer — would log a second one. Closing here would leave
    // a star that rolled back over a cook that did land, with nothing on screen
    // admitting either.
    const { recipe } = givenAnUncookedRecipe()
    const calls: string[] = []
    let ratingAttempts = 0
    server.use(
      http.post('*/cook-log', () => {
        calls.push('cook')
        return HttpResponse.json({ id: 'c1', recipeId: recipe.id, recipeTitle: recipe.title, cookedAt: 'x', recipeAvailable: true }, { status: 201 })
      }),
      http.put('*/recipes/:id/rating', async ({ request }) => {
        const body = (await request.json()) as { rating: number }
        ratingAttempts += 1
        // 1st = the tap that opened the prompt, 2nd = after the cook (fails),
        // 3rd = Try again.
        if (ratingAttempts === 1) return HttpResponse.json({ error: 'no cook' }, { status: 409 })
        if (ratingAttempts === 2) {
          calls.push('rating-failed')
          return HttpResponse.json({ error: 'boom' }, { status: 500 })
        }
        calls.push('rating')
        return HttpResponse.json({ recipeId: recipe.id, timesCooked: 1, rating: body.rating, cookedByMe: true })
      }),
    )
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/No ratings yet/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Today' }))

    expect(await screen.findByText('Your cook is recorded.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.queryByText('Your cook is recorded.')).not.toBeInTheDocument())
    // One cook, not two — the retry re-rated and did not re-record.
    expect(calls).toEqual(['cook', 'rating-failed', 'rating'])
  })

  it('keeps the prompt open, with the star still unwritten, when the cook fails', async () => {
    const { recipe, wire } = givenAnUncookedRecipe()
    // The cook write is the one that can fail here, and dropping the sheet on a
    // failure would leave a star that went back off and nothing to explain it.
    server.use(http.post('*/cook-log', () => HttpResponse.json({ error: 'nope' }, { status: 500 })))
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/No ratings yet/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Today' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not record that cook/)
    expect(screen.getByText('You cooked this before?')).toBeInTheDocument()
    expect(wire.ratings).toEqual([])
  })
})
