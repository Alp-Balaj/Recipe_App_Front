import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { renderRoute, TEST_USER } from '@/test/utils'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `saved-r${idSeq}`,
    title: `Saved recipe ${idSeq}`,
    description: 'Kept for later.',
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

describe('ProfilePage (own profile, cp06 upgrades)', () => {
  it('shows real counts and rank from GET /users/{id}, with Settings still the default tab', async () => {
    server.use(
      http.get('*/users/:id', ({ params }) => {
        expect(params.id).toBe(TEST_USER.userId)
        return HttpResponse.json(
          makeUserProfile({ cookingRank: 4, followerCount: 3, followingCount: 1, recipeCount: 2 }),
        )
      }),
    )
    renderRoute('/profile')

    expect(await screen.findByText('✦ Rank 4')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Followers')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Following')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Recipes')).toBeInTheDocument()
    // checkpoint-02 content still the default section.
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('lists saved recipes under the Saved tab', async () => {
    server.use(
      http.get('*/users/me/saved-recipes', () =>
        HttpResponse.json({
          items: [makeRecipe({ title: 'Bookmarked bibimbap' }), makeRecipe({ title: 'Kept katsu' })],
          nextCursor: null,
        }),
      ),
    )
    renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: '⚑ Saved' }))
    expect(await screen.findByText('Bookmarked bibimbap')).toBeInTheDocument()
    expect(screen.getByText('Kept katsu')).toBeInTheDocument()
    expect(screen.getByText("That's everything you've saved.")).toBeInTheDocument()
    // Settings content swapped out while Saved is active.
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
  })

  it('shows the saved empty state with a browse escape hatch', async () => {
    // Default handler already returns an empty saved list.
    const router = renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: '⚑ Saved' }))
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Browse recipes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'))
  })

  it('unsaves from the Saved tab: card drops out optimistically and DELETE fires', async () => {
    const deletes: string[] = []
    server.use(
      http.get('*/users/me/saved-recipes', () =>
        HttpResponse.json({
          items: [makeRecipe({ id: 'unsave-1', title: 'Unsavable udon' })],
          nextCursor: null,
        }),
      ),
      http.delete('*/recipes/:id/saves', ({ params }) => {
        deletes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: '⚑ Saved' }))
    expect(await screen.findByText('Unsavable udon')).toBeInTheDocument()

    // savedByMe is seeded true (it came from the saved list) → the affordance
    // is already "Remove from saved".
    await userEvent.click(screen.getByRole('button', { name: 'Remove from saved' }))
    await waitFor(() => expect(screen.queryByText('Unsavable udon')).not.toBeInTheDocument())
    await waitFor(() => expect(deletes).toEqual(['unsave-1']))
  })

  it('walks the saved keyset via Load more, passing nextCursor back verbatim', async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get('*/users/me/saved-recipes', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) {
          return HttpResponse.json({
            items: [makeRecipe({ id: 's1', title: 'Saved page one' })],
            nextCursor: 'SCUR2',
          })
        }
        return HttpResponse.json({
          items: [makeRecipe({ id: 's2', title: 'Saved page two' })],
          nextCursor: null,
        })
      }),
    )
    renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: '⚑ Saved' }))
    expect(await screen.findByText('Saved page one')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Load more'))
    expect(await screen.findByText('Saved page two')).toBeInTheDocument()
    expect(screen.getAllByText('Saved page one')).toHaveLength(1)
    expect(cursors).toEqual([null, 'SCUR2'])
  })
})
