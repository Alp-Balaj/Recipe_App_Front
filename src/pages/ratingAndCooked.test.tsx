// open-loops slice 1 — the rating control on the recipe detail page and the
// "I cooked this" action on a planned day. Both write through the SHARED
// useSocialMutations path, so the interesting assertions are about what the
// caches show and what actually reaches the wire.

import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
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
    id: `rate-r${idSeq}`,
    title: `Rateable dish ${idSeq}`,
    description: 'Tell us how it went.',
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

/** Detail page for one recipe with a given envelope on the wire. */
function givenRecipe(social: Partial<RecipeSocialResponse> = {}, recipe: Partial<RecipeResponse> = {}) {
  const r = makeRecipe(recipe)
  server.use(
    http.get('*/recipes/:id', () => HttpResponse.json(r)),
    http.get('*/recipes/:id/social', () => HttpResponse.json(makeSocial(social))),
    http.get('*/recipes/:id/comments', () => HttpResponse.json({ items: [], nextCursor: null })),
  )
  return r
}

describe('the rating control', () => {
  it('reads the average off the envelope', async () => {
    const recipe = givenRecipe({ averageRating: 4.25, ratingCount: 8, myRating: 4, cookedByMe: true })
    renderRoute(`/recipes/${recipe.id}`)

    expect(await screen.findByText(/4\.3 from 8 ratings/)).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Rate this recipe' })
    // Four filled, one empty.
    expect(within(group).getAllByRole('button', { pressed: true })).toHaveLength(4)
  })

  it('says so plainly when nobody has rated — never a zero-star average', async () => {
    const recipe = givenRecipe({ averageRating: null, ratingCount: 0 })
    renderRoute(`/recipes/${recipe.id}`)

    expect(await screen.findByText(/No ratings yet/)).toBeInTheDocument()
    const group = screen.getByRole('group', { name: 'Rate this recipe' })
    expect(within(group).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })

  it('sends the picked star and recomputes the average without a refetch', async () => {
    const recipe = givenRecipe({ averageRating: 2, ratingCount: 1 })
    const sent: number[] = []
    server.use(
      http.put('*/recipes/:id/rating', async ({ request }) => {
        const body = (await request.json()) as { rating: number }
        sent.push(body.rating)
        return HttpResponse.json({ recipeId: recipe.id, timesCooked: 0, rating: body.rating, cookedByMe: true })
      }),
    )
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/2\.0 from 1 rating/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))

    await waitFor(() => expect(sent).toEqual([4]))
    // (2 + 4) / 2 = 3.0 — derived from the caller's own contribution, no refetch.
    expect(await screen.findByText(/3\.0 from 2 ratings/)).toBeInTheDocument()
  })

  it('retracts when the already-picked star is tapped again — and takes only the rating (KAN-12)', async () => {
    const recipe = givenRecipe({ averageRating: 5, ratingCount: 1, myRating: 5, cookedByMe: true })
    let ratingDeletes = 0
    let cookedDeletes = 0
    server.use(
      http.delete('*/recipes/:id/rating', () => {
        ratingDeletes += 1
        // The cooks survive, so the reply is the row that is LEFT, not a zeroed one.
        return HttpResponse.json({ recipeId: recipe.id, timesCooked: 4, rating: null, cookedByMe: true })
      }),
      // Reaching this one instead would hard-delete four cooks and their notes.
      http.delete('*/recipes/:id/cooked', () => {
        cookedDeletes += 1
        return HttpResponse.json({ recipeId: recipe.id, timesCooked: 0, rating: null, cookedByMe: false })
      }),
    )
    renderRoute(`/recipes/${recipe.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Remove your 5-star rating' }))

    await waitFor(() => expect(ratingDeletes).toBe(1))
    expect(cookedDeletes).toBe(0)
    // The only rating is gone, so the average returns to unknown rather than 0.
    expect(await screen.findByText(/No ratings yet/)).toBeInTheDocument()
  })

  it('rolls back when the write fails', async () => {
    const recipe = givenRecipe({ averageRating: 2, ratingCount: 1 })
    server.use(http.put('*/recipes/:id/rating', () => new HttpResponse(null, { status: 500 })))
    renderRoute(`/recipes/${recipe.id}`)

    await screen.findByText(/2\.0 from 1 rating/)
    await userEvent.click(screen.getByRole('button', { name: 'Rate 5 out of 5' }))

    await waitFor(() => expect(screen.getByText(/2\.0 from 1 rating/)).toBeInTheDocument())
    const group = screen.getByRole('group', { name: 'Rate this recipe' })
    expect(within(group).queryAllByRole('button', { pressed: true })).toHaveLength(0)
  })
})
