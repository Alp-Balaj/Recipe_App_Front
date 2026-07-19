// F1 — the detail page seeds the decision-I3 envelope seam from
// GET /recipes/{id}/social when the caches can't answer (decision
// recipe-social-envelope-endpoint, 2026-07-19). The failing cp08 scenario:
// a recipe's OWN AUTHOR opens their detail page (their posts never reach
// their own feed) and must still see real like/comment counts.

import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, TEST_USER } from '@/test/utils'
import type { FeedListResponse, RecipeSocialResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `f1-r${idSeq}`,
    title: `Fallback dish ${idSeq}`,
    description: 'Counts should be real.',
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

function makeSocial(over: Partial<RecipeSocialResponse> = {}): RecipeSocialResponse {
  return {
    author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    savedByMe: false,
    ...over,
  }
}

describe('RecipeDetailPage envelope fallback (F1)', () => {
  it('the author sees real counts on their OWN detail page (the cp08 F1 scenario)', async () => {
    // The authenticated test user is the recipe author; nothing in any cache.
    const recipe = makeRecipe({ id: 'own-1', title: 'My engaged noodles', createdByUserId: TEST_USER.userId })
    let socialRequests = 0
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(recipe)),
      http.get('*/recipes/:id/social', () => {
        socialRequests += 1
        return HttpResponse.json(makeSocial({ likeCount: 1, commentCount: 1 }))
      }),
    )
    renderRoute('/recipes/own-1')

    // ♥ 1 in the header (someone ELSE liked it — likedByMe stays false)…
    const likeBtn = await screen.findByRole('button', { name: 'Like' })
    await waitFor(() => expect(likeBtn).toHaveTextContent('1'))
    expect(likeBtn).toHaveAttribute('aria-pressed', 'false')
    // …and the real comment count in the section label.
    expect(await screen.findByText('Comments (1)')).toBeInTheDocument()
    expect(socialRequests).toBe(1)
  })

  it('adopts caller-relative flags from the endpoint (non-author viewer)', async () => {
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'flag-1', title: 'Flagged flatbread' }))),
      http.get('*/recipes/:id/social', () =>
        HttpResponse.json(makeSocial({ likeCount: 3, commentCount: 0, likedByMe: true, savedByMe: true })),
      ),
    )
    renderRoute('/recipes/flag-1')

    const unlikeBtn = await screen.findByRole('button', { name: 'Unlike' })
    expect(unlikeBtn).toHaveAttribute('aria-pressed', 'true')
    expect(unlikeBtn).toHaveTextContent('3')
    expect(await screen.findByRole('button', { name: 'Remove from saved' })).toBeInTheDocument()
    expect(await screen.findByText('Comments (0)')).toBeInTheDocument()
  })

  it('a feed-cache hit still wins — no endpoint request (seed-once preserved)', async () => {
    const recipe = makeRecipe({ id: 'feed-1', title: 'Fed focaccia' })
    let socialRequests = 0
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
            },
          ],
          nextCursor: null,
          source: 'following',
        } satisfies FeedListResponse),
      ),
      http.get('*/recipes/:id', () => HttpResponse.json(recipe)),
      http.get('*/recipes/:id/social', () => {
        socialRequests += 1
        return HttpResponse.json(makeSocial())
      }),
    )
    renderRoute('/feed')
    await userEvent.click(await screen.findByRole('link', { name: 'Fed focaccia' }))

    expect(await screen.findByRole('button', { name: 'Unlike' })).toHaveTextContent('7')
    expect(await screen.findByText('Comments (4)')).toBeInTheDocument()
    expect(socialRequests).toBe(0)
  })

  it('404 degrades to the hidden-counts rendering with exactly one request (no retry spam)', async () => {
    let socialRequests = 0
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'gone-1', title: 'Ghost gnocchi' }))),
      http.get('*/recipes/:id/social', () => {
        socialRequests += 1
        return new HttpResponse(null, { status: 404 })
      }),
    )
    renderRoute('/recipes/gone-1')

    const likeBtn = await screen.findByRole('button', { name: 'Like' })
    await waitFor(() => expect(socialRequests).toBe(1))
    // Settle a beat, then confirm: still one request, no invented counts.
    await new Promise((r) => setTimeout(r, 120))
    expect(socialRequests).toBe(1)
    expect(likeBtn.textContent).not.toMatch(/\d/)
    expect(screen.getByText('Comments')).toBeInTheDocument()
    expect(screen.queryByText(/Comments \(/)).not.toBeInTheDocument()
  })

  it('upgrades a cache-only unknown entry when the detail mounts (browse → detail)', async () => {
    const recipe = makeRecipe({ id: 'up-1', title: 'Upgraded udon' })
    let socialRequests = 0
    server.use(
      http.get('*/recipes', () => HttpResponse.json({ items: [recipe], nextCursor: null })),
      http.get('*/recipes/:id', () => HttpResponse.json(recipe)),
      http.get('*/recipes/:id/social', () => {
        socialRequests += 1
        return HttpResponse.json(makeSocial({ likeCount: 2, commentCount: 5 }))
      }),
    )
    // Browse first: the card derives a cache-only, all-unknown envelope entry
    // (list surfaces deliberately do NOT fetch — no N-per-page fan-out).
    renderRoute('/library')
    expect(await screen.findByText('Upgraded udon')).toBeInTheDocument()
    expect(socialRequests).toBe(0)

    // Opening the detail upgrades the pre-existing unknown entry via ONE fetch.
    await userEvent.click(screen.getByRole('link', { name: 'Upgraded udon' }))
    expect(await screen.findByText('Comments (5)')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Like' })).toHaveTextContent('2'),
    )
    expect(socialRequests).toBe(1)
  })

  it('an optimistic like is not clobbered by an in-flight fallback response', async () => {
    const likePosts: string[] = []
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'race-1', title: 'Racy ragu' }))),
      http.get('*/recipes/:id/social', async () => {
        await delay(150)
        return HttpResponse.json(makeSocial({ likeCount: 1, likedByMe: false }))
      }),
      http.post('*/recipes/:id/likes', ({ params }) => {
        likePosts.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/recipes/race-1')

    // Click Like while GET /recipes/{id}/social is still pending.
    await userEvent.click(await screen.findByRole('button', { name: 'Like' }))
    const unlikeBtn = await screen.findByRole('button', { name: 'Unlike' })
    expect(unlikeBtn).toHaveAttribute('aria-pressed', 'true')

    // Let the delayed response window pass — the flip must survive it.
    await new Promise((r) => setTimeout(r, 250))
    expect(screen.getByRole('button', { name: 'Unlike' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(likePosts).toEqual(['race-1']))
  })
})
