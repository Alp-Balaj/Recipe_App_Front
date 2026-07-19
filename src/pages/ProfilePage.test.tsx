// ─────────────────────────────────────────────────────────────────────────
// /profile — the redesigned own-profile tab (Recipe App Redesign, design 3b).
// jsdom's matchMedia stub reports matches:false, so these exercise the mobile
// layout. Covered: the hero (name + rank tier + real counts), derived badges,
// the Recipes / Saved / Activity tabs, the Settings screen (theme + logout),
// and the Followers overlay.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { makeAuthValue, renderRoute, TEST_USER } from '@/test/utils'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `prof-r${idSeq}`,
    title: `Recipe ${idSeq}`,
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

/** GET /users/{me} with distinct counts so each stat is uniquely assertable. */
function useProfile(over: Partial<ReturnType<typeof makeUserProfile>> = {}) {
  server.use(
    http.get('*/users/:id', ({ params }) => {
      expect(params.id).toBe(TEST_USER.userId)
      return HttpResponse.json(makeUserProfile(over))
    }),
  )
}

describe('ProfilePage — hero + rank + counts', () => {
  it('shows the name, rank tier, and real follower/following/recipe counts', async () => {
    useProfile({ cookingRank: 4, followerCount: 3, followingCount: 1, recipeCount: 2 })
    renderRoute('/profile')

    // Name is immediate (from auth); wait on a profile-dependent stat tile.
    expect(await screen.findByText('testuser')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '2 Recipes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3 Followers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1 Following' })).toBeInTheDocument()

    // Derived rank tier (4 pts → "Novice", the entry tier) + the raw points line.
    expect(screen.getAllByText('Novice').length).toBeGreaterThan(0)
    expect(screen.getByText('4 pts')).toBeInTheDocument()
  })

  it('derives the badge count from real stats (2 of 6 here)', async () => {
    // recipeCount≥1 (First cook) + followerCount≥1 (Getting noticed) = 2 earned.
    useProfile({ cookingRank: 4, followerCount: 3, followingCount: 1, recipeCount: 2 })
    renderRoute('/profile')
    expect(await screen.findByText('2 of 6')).toBeInTheDocument()
  })
})

describe('ProfilePage — Recipes tab (default)', () => {
  it('lists the caller\'s own recipes as rows', async () => {
    server.use(
      http.get('*/recipes', () =>
        HttpResponse.json({
          items: [
            makeRecipe({ id: 'own-1', title: 'My paella', createdByUserId: TEST_USER.userId }),
            makeRecipe({ id: 'other-1', title: 'Someone else', createdByUserId: 'author-1' }),
          ],
          nextCursor: null,
        }),
      ),
    )
    renderRoute('/profile')

    // Own recipe shows; the foreign one is filtered out.
    expect(await screen.findByText('My paella')).toBeInTheDocument()
    expect(screen.queryByText('Someone else')).not.toBeInTheDocument()
  })

  it('shows an empty state with a create escape hatch when there are no recipes', async () => {
    const router = renderRoute('/profile')
    expect(await screen.findByText('No recipes yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create your first' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/new'))
  })
})

describe('ProfilePage — Saved tab', () => {
  it('lists saved recipes and hides the Recipes content', async () => {
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
  })

  it('shows the saved empty state with a browse escape hatch', async () => {
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

describe('ProfilePage — Activity tab', () => {
  it('derives a published-recipe timeline from the caller\'s own recipes', async () => {
    server.use(
      http.get('*/recipes', () =>
        HttpResponse.json({
          items: [makeRecipe({ id: 'a1', title: 'Timeline tacos', createdByUserId: TEST_USER.userId })],
          nextCursor: null,
        }),
      ),
    )
    renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: '⟳ Activity' }))
    expect(await screen.findByText('Timeline tacos')).toBeInTheDocument()
    expect(screen.getByText(/Published/)).toBeInTheDocument()
  })
})

describe('ProfilePage — Settings', () => {
  it('opens Settings (theme + logout) and logs out', async () => {
    let loggedOut = false
    const auth = makeAuthValue({ logout: () => { loggedOut = true } })
    renderRoute('/profile', { auth })

    await userEvent.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    expect(await screen.findByText('Appearance')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(loggedOut).toBe(true)
  })

  it('switches theme from the Settings appearance toggle', async () => {
    renderRoute('/profile')
    await userEvent.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    const light = await screen.findByRole('button', { name: '☀ Light' })
    await userEvent.click(light)
    await waitFor(() => expect(light).toHaveAttribute('aria-pressed', 'true'))
  })

  it('returns to the profile from Settings via Back', async () => {
    renderRoute('/profile')
    await userEvent.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    expect(await screen.findByText('Appearance')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    // The tab bar is back.
    expect(await screen.findByRole('button', { name: '⚑ Saved' })).toBeInTheDocument()
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
  })
})

describe('ProfilePage — desktop layout', () => {
  // Force the >=1024px branch so the two-column desktop layout renders (the
  // default matchMedia stub reports false → mobile).
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  it('renders the desktop summary column, tabs and New-recipe action', async () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('1024'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia

    useProfile({ cookingRank: 200, followerCount: 12, followingCount: 4, recipeCount: 8 })
    const router = renderRoute('/profile')

    // Summary column stats + the desktop content-pane New-recipe button.
    // rec≥1, fol≥1, fol≥10, rank≥200 pts → 4 badges earned.
    expect(await screen.findByRole('button', { name: '8 Recipes' })).toBeInTheDocument()
    expect(screen.getByText('4 of 6')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '＋ New recipe' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/new'))
  })
})

describe('ProfilePage — Followers overlay', () => {
  it('opens the Followers list from the stat tile and links into a profile', async () => {
    useProfile({ followerCount: 1 })
    server.use(
      http.get('*/users/:id/followers', () =>
        HttpResponse.json({
          items: [{ id: 'follower-1', username: 'chef_ana', profileImageUrl: null }],
          nextCursor: null,
        }),
      ),
    )
    const router = renderRoute('/profile')

    await userEvent.click(await screen.findByRole('button', { name: '1 Followers' }))
    const dialog = await screen.findByRole('dialog', { name: 'Followers' })
    const row = await within(dialog).findByRole('button', { name: /chef_ana/ })
    await userEvent.click(row)
    await waitFor(() => expect(router.state.location.pathname).toBe('/users/follower-1'))
  })
})
