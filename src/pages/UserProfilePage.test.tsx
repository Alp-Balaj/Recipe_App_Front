import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { renderRoute, TEST_USER } from '@/test/utils'
import type { RecipeResponse } from '@/api/types'
import type { FeedListResponse } from '@/api/social'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `prof-r${idSeq}`,
    title: `Profile recipe ${idSeq}`,
    description: 'From this cook.',
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
    ingredients: [],
    steps: [],
    tags: [],
    createdByUserId: 'author-1',
    ...over,
  }
}

describe('UserProfilePage', () => {
  it('renders the avatar block, bio, rank, and counts', async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(
          makeUserProfile({
            id: 'author-1',
            username: 'chef_ana',
            bio: 'Weeknight wok wizard.',
            cookingRank: 3,
            followerCount: 5,
            followingCount: 2,
            recipeCount: 4,
          }),
        ),
      ),
    )
    renderRoute('/users/author-1')

    expect(await screen.findByText('chef_ana')).toBeInTheDocument()
    expect(screen.getByText('Weeknight wok wizard.')).toBeInTheDocument()
    expect(screen.getByText('✦ Rank 3')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Followers')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Following')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    // 'Recipes' appears twice by design: the stat label + the grid section label.
    expect(screen.getAllByText('Recipes')).toHaveLength(2)
  })

  it('follows and unfollows optimistically, bumping the follower count', async () => {
    const requests: string[] = []
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(
          makeUserProfile({ id: 'author-1', username: 'chef_ana', followerCount: 5 }),
        ),
      ),
      http.post('*/users/:id/follow', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/users/:id/follow', ({ params }) => {
        requests.push(`DELETE ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/users/author-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }))
    // Optimistic: label + count flip before the 204 lands.
    const followingBtn = await screen.findByRole('button', { name: '✓ Following' })
    expect(followingBtn).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('6')).toBeInTheDocument()
    await waitFor(() => expect(requests).toEqual(['POST author-1']))

    await userEvent.click(followingBtn)
    expect(await screen.findByRole('button', { name: 'Follow' })).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    await waitFor(() => expect(requests).toEqual(['POST author-1', 'DELETE author-1']))
  })

  it('rolls the optimistic follow back when the server rejects it', async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(
          makeUserProfile({ id: 'author-1', username: 'chef_ana', followerCount: 5 }),
        ),
      ),
      http.post('*/users/:id/follow', () => new HttpResponse(null, { status: 500 })),
    )
    renderRoute('/users/author-1')

    await userEvent.click(await screen.findByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('hides the follow button on your own profile', async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(makeUserProfile({ id: TEST_USER.userId, username: TEST_USER.username })),
      ),
    )
    renderRoute(`/users/${TEST_USER.userId}`)

    expect(await screen.findByText('testuser')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument()
    expect(screen.getByText(/This is you/)).toBeInTheDocument()
  })

  it('renders the 3-column recipe grid and navigates into a recipe', async () => {
    const tileRecipe = makeRecipe({ id: 'grid-1', title: 'Grid gnocchi' })
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(makeUserProfile({ id: 'author-1', username: 'chef_ana' })),
      ),
      http.get('*/users/:id/recipes', () =>
        HttpResponse.json({ items: [tileRecipe, makeRecipe({ title: 'Second dish' })], nextCursor: null }),
      ),
      http.get('*/recipes/:id', () => HttpResponse.json(tileRecipe)),
    )
    const router = renderRoute('/users/author-1')

    await userEvent.click(await screen.findByRole('link', { name: 'Grid gnocchi' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/grid-1'))
  })

  it('walks the recipe grid keyset via Load more, passing nextCursor back verbatim', async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(makeUserProfile({ id: 'author-1', username: 'chef_ana' })),
      ),
      http.get('*/users/:id/recipes', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) {
          return HttpResponse.json({
            items: [makeRecipe({ id: 'g1', title: 'Grid page one' })],
            nextCursor: 'GCUR2',
          })
        }
        return HttpResponse.json({
          items: [makeRecipe({ id: 'g2', title: 'Grid page two' })],
          nextCursor: null,
        })
      }),
    )
    renderRoute('/users/author-1')

    expect(await screen.findByRole('link', { name: 'Grid page one' })).toBeInTheDocument()
    await userEvent.click(screen.getByText('Load more'))
    expect(await screen.findByRole('link', { name: 'Grid page two' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Grid page one' })).toHaveLength(1)
    expect(cursors).toEqual([null, 'GCUR2'])
  })

  it('shows a not-found state when the API 404s the user', async () => {
    server.use(http.get('*/users/:id', () => new HttpResponse(null, { status: 404 })))
    renderRoute('/users/nobody')
    expect(await screen.findByText('User not found')).toBeInTheDocument()
  })

  it('is reachable from the feed card author header', async () => {
    server.use(
      http.get('*/feed', () =>
        HttpResponse.json({
          items: [
            {
              recipe: makeRecipe({ id: 'feed-1', title: 'Feed dish' }),
              author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
              likeCount: 0,
              commentCount: 0,
              likedByMe: false,
              savedByMe: false,
            },
          ],
          nextCursor: null,
          source: 'following',
        } satisfies FeedListResponse),
      ),
      http.get('*/users/:id', () =>
        HttpResponse.json(makeUserProfile({ id: 'author-1', username: 'chef_ana' })),
      ),
    )
    const router = renderRoute('/feed')

    await userEvent.click(await screen.findByRole('button', { name: 'chef_ana' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/users/author-1'))
    // The profile page renders (no longer the cp05 catch-all fallthrough).
    expect(await screen.findByText('Followers')).toBeInTheDocument()
  })
})
