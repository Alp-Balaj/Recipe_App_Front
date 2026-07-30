// Detail + browse adopting like/save through the shared social layer
// (social-feed cp06, decision I3: RecipeResponse has no envelope — state
// comes from feed-cache hits via useSocialEnvelope, unknown otherwise).

import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { FeedListResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `adopt-r${idSeq}`,
    title: `Adoptable ${idSeq}`,
    description: 'Interact with me.',
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
    ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp' }],
    steps: [],
    tags: [],
    createdByUserId: 'author-1',
    ...over,
  }
}

describe('RecipeDetailPage social adoption', () => {
  it('likes from the detail header (unknown state → POST) and flips the affordance', async () => {
    const requests: string[] = []
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'det-1', title: 'Detail dish' }))),
      http.post('*/recipes/:id/likes', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/recipes/det-1')

    const likeBtn = await screen.findByRole('button', { name: 'Like' })
    expect(likeBtn).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(likeBtn)

    const unlikeBtn = await screen.findByRole('button', { name: 'Unlike' })
    expect(unlikeBtn).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(requests).toEqual(['POST det-1']))
  })

  it('saves from the detail header through the shared hook', async () => {
    const requests: string[] = []
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'det-2', title: 'Savory detail' }))),
      http.post('*/recipes/:id/saves', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/recipes/det-2')

    await userEvent.click(await screen.findByRole('button', { name: 'Save recipe' }))
    expect(await screen.findByRole('button', { name: 'Remove from saved' })).toBeInTheDocument()
    await waitFor(() => expect(requests).toEqual(['POST det-2']))
  })

  it('carries the feed envelope into the detail page (decision-I3 seam)', async () => {
    const recipe = makeRecipe({ id: 'env-1', title: 'Enveloped enchiladas' })
    server.use(
      http.get('*/feed', () =>
        HttpResponse.json({
          items: [
            {
              recipe,
              author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
              likeCount: 7,
              commentCount: 4,
              likedByMe: true,
              savedByMe: false,
              averageRating: null,
              ratingCount: 0,
              cookedByMe: false,
              myRating: null,
            },
          ],
          nextCursor: null,
          source: 'following',
        } satisfies FeedListResponse),
      ),
      http.get('*/recipes/:id', () => HttpResponse.json(recipe)),
    )
    renderRoute('/feed')

    // Open the detail from the feed card body.
    await userEvent.click(await screen.findByRole('link', { name: 'Enveloped enchiladas' }))

    // The detail header knows the envelope from the feed cache: liked, count 7,
    // and the comments section header carries the known count.
    const unlikeBtn = await screen.findByRole('button', { name: 'Unlike' })
    expect(unlikeBtn).toHaveTextContent('7')
    expect(await screen.findByText('Comments (4)')).toBeInTheDocument()
  })

  it('renders the comments panel on the detail page and posts there', async () => {
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'det-3', title: 'Discussable dal' }))),
      http.post('*/recipes/:id/comments', async ({ request }) => {
        const body = (await request.json()) as { content: string }
        return HttpResponse.json(
          {
            id: 'new-c1',
            content: body.content,
            createdAt: '2026-07-02T00:00:00Z',
            updatedAt: null,
            authorId: '11111111-1111-1111-1111-111111111111',
            authorUsername: 'testuser',
            recipeId: 'det-3',
          },
          { status: 201 },
        )
      }),
    )
    renderRoute('/recipes/det-3')

    expect(await screen.findByText('No comments yet — be the first.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Detail-side comment')
    await userEvent.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Detail-side comment')).toBeInTheDocument()
  })
})

describe('BrowsePage social adoption', () => {
  it('browse cards carry like/save and like POSTs through the shared hook', async () => {
    const requests: string[] = []
    server.use(
      http.get('*/recipes', () =>
        HttpResponse.json({
          items: [makeRecipe({ id: 'br-1', title: 'Browsable bao' })],
          nextCursor: null,
        }),
      ),
      http.post('*/recipes/:id/likes', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/discover')

    expect(await screen.findByText('Browsable bao')).toBeInTheDocument()
    // Unknown envelope → no count shown, affordance reads "not yet liked".
    const likeBtn = screen.getByRole('button', { name: 'Like' })
    await userEvent.click(likeBtn)
    expect(await screen.findByRole('button', { name: 'Unlike' })).toBeInTheDocument()
    await waitFor(() => expect(requests).toEqual(['POST br-1']))
  })

  it('browse cards save through the shared hook', async () => {
    const requests: string[] = []
    server.use(
      http.get('*/recipes', () =>
        HttpResponse.json({
          items: [makeRecipe({ id: 'br-2', title: 'Savable satay' })],
          nextCursor: null,
        }),
      ),
      http.post('*/recipes/:id/saves', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/discover')

    expect(await screen.findByText('Savable satay')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
    expect(await screen.findByRole('button', { name: 'Remove from saved' })).toBeInTheDocument()
    await waitFor(() => expect(requests).toEqual(['POST br-2']))
  })
})
