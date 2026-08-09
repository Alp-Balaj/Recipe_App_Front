// ─────────────────────────────────────────────────────────────────────────
// /feed, DESKTOP (feed redesign, 2026-08-09).
//
// A separate file from FeedPage.test.tsx on purpose: jsdom's shared matchMedia
// stub reports matches:false, so that file exercises the mobile immersive feed
// and this one has to override the stub for the whole file. Keeping the two in
// one file would mean every existing mobile assertion depended on which test
// last touched the global.
// ─────────────────────────────────────────────────────────────────────────

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { FeedItemResponse, FeedListResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'

const realMatchMedia = window.matchMedia

/**
 * Wide desktop: both the 1024px shell breakpoint AND the 1432px the rail needs.
 * Reporting true for every min-width query is enough — the page asks no other.
 */
beforeAll(() => {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia
})

afterAll(() => {
  window.matchMedia = realMatchMedia
})

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `desk-r${idSeq}`,
    title: `Desktop recipe ${idSeq}`,
    description: 'A very shareable dinner.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: 'Japanese',
    caloriesPerServing: 420,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: ['Quick'],
    createdByUserId: 'author-1',
    ...over,
  }
}

function makeItem(over: Partial<FeedItemResponse> = {}, recipe: Partial<RecipeResponse> = {}): FeedItemResponse {
  return {
    recipe: makeRecipe(recipe),
    author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
    likeCount: 5,
    commentCount: 3,
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

function feedPage(items: FeedItemResponse[], over: Partial<FeedListResponse> = {}): FeedListResponse {
  return { items, nextCursor: null, source: 'forYou', ...over }
}

/** Four posts — one whole hero / grid / grid / horizontal cycle. */
function fourPosts(): FeedItemResponse[] {
  return [
    makeItem({ madeItCount: 2, recentMakers: [{ id: 'm1', username: 'nadia', profileImageUrl: null }] }, { id: 'lead', title: 'Lead tomato tart' }),
    makeItem({}, { id: 'g1', title: 'Grid lemon orzo' }),
    makeItem({}, { id: 'g2', title: 'Grid cucumber salad' }),
    makeItem({}, { id: 'h1', title: 'Horizontal focaccia' }),
  ]
}

describe('FeedPage — desktop', () => {
  it('leads with a dated masthead beside the tabs', async () => {
    server.use(http.get('*/feed', () => HttpResponse.json(feedPage(fourPosts()))))
    renderRoute('/feed')

    await screen.findByText('Lead tomato tart')
    // The eyebrow is FEED · <today, uppercased> — assert the shape, not a date
    // this test would have to recompute (and get wrong in another timezone).
    expect(screen.getByText(/^FEED · [A-Z]/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'For You' })).toHaveAttribute('aria-selected', 'true')
  })

  it('lays the first cycle out under its three section headings', async () => {
    server.use(http.get('*/feed', () => HttpResponse.json(feedPage(fourPosts()))))
    renderRoute('/feed')

    expect(await screen.findByText('Latest from your people')).toBeInTheDocument()
    expect(screen.getByText('Also today')).toBeInTheDocument()
    expect(screen.getByText('Earlier this week')).toBeInTheDocument()
    // Every post is still rendered — the rhythm reshapes them, it never drops one.
    for (const title of ['Lead tomato tart', 'Grid lemon orzo', 'Grid cucumber salad', 'Horizontal focaccia']) {
      expect(screen.getByRole('link', { name: title })).toBeInTheDocument()
    }
  })

  it('does not repeat the headings for a second page of posts', async () => {
    let page = 0
    server.use(
      http.get('*/feed', () => {
        page += 1
        return HttpResponse.json(
          page === 1
            ? feedPage(fourPosts(), { nextCursor: 'CUR2' })
            : feedPage([makeItem({}, { id: 'p2', title: 'Second page lead' })]),
        )
      }),
    )
    renderRoute('/feed')
    await screen.findByText('Lead tomato tart')

    await userEvent.click(screen.getByText('Load more'))
    expect(await screen.findByText('Second page lead')).toBeInTheDocument()
    // One of each, still — later batches continue the rhythm silently.
    expect(screen.getAllByText('Latest from your people')).toHaveLength(1)
    expect(screen.getAllByText('Also today')).toHaveLength(1)
  })

  // The hero is the only card carrying the made-it row and the inline comment
  // strip; the grid cards must not sprout either.
  it('gives the hero the made-it row and an inline comment strip', async () => {
    server.use(http.get('*/feed', () => HttpResponse.json(feedPage(fourPosts()))))
    renderRoute('/feed')
    await screen.findByText('Lead tomato tart')

    expect(screen.getByText('2 made this')).toBeInTheDocument()
    expect(screen.getByText('Add a comment…')).toBeInTheDocument()
    expect(screen.getByText('All 3')).toBeInTheDocument()
  })

  it('renders no made-it row when nobody has cooked it', async () => {
    server.use(
      http.get('*/feed', () => HttpResponse.json(feedPage([makeItem({}, { id: 'solo', title: 'Uncooked stew' })]))),
    )
    renderRoute('/feed')
    await screen.findByText('Uncooked stew')

    expect(screen.queryByText(/made this/)).not.toBeInTheDocument()
  })

  it('expands the hero strip into the real comments panel', async () => {
    server.use(
      http.get('*/feed', () => HttpResponse.json(feedPage([makeItem({ commentCount: 1 }, { id: 'c1', title: 'Commented curry' })]))),
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [
            {
              id: 'cm1',
              content: 'froze the butter and it behaved',
              createdAt: '2026-07-02T00:00:00Z',
              updatedAt: null,
              authorId: 'u9',
              authorUsername: 'the_bread_guy',
              recipeId: 'c1',
              likeCount: 0,
              likedByMe: false,
            },
          ],
          nextCursor: null,
        }),
      ),
    )
    renderRoute('/feed')
    await screen.findByText('Commented curry')

    // Collapsed: the newest comment previews above the pill.
    expect(await screen.findByText('froze the butter and it behaved')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Add a comment…'))
    // Expanded: the panel's own composer replaces the pill.
    expect(await screen.findByPlaceholderText(/comment/i)).toBeInTheDocument()
    expect(screen.queryByText('Add a comment…')).not.toBeInTheDocument()
  })

  // The Following tab's end of list is a destination, not the plain
  // "You're all caught up." line the For You tab keeps.
  it('closes a fully-read Following tab with the Find cooks card', async () => {
    server.use(
      http.get('*/feed', ({ request }) =>
        new URL(request.url).searchParams.get('scope') === 'following'
          ? HttpResponse.json(feedPage([makeItem({}, { id: 'f1', title: 'Followed frittata' })], { source: 'following' }))
          : HttpResponse.json(feedPage([makeItem({}, { id: 'y1', title: 'For-you focaccia' })])),
      ),
    )
    const router = renderRoute('/feed')
    await screen.findByText('For-you focaccia')
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Following' }))
    await screen.findByText('Followed frittata')
    expect(screen.getByText('Caught up')).toBeInTheDocument()
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Find cooks' }))
    expect(router.state.location.pathname).toBe('/discover')
  })

  it('counts the new batch in the Following heading chip', async () => {
    server.use(
      http.get('*/feed', ({ request }) =>
        new URL(request.url).searchParams.get('scope') === 'following'
          ? HttpResponse.json(
              feedPage([makeItem({}, { id: 'f1', title: 'Followed one' }), makeItem({}, { id: 'f2', title: 'Followed two' })], {
                source: 'following',
              }),
            )
          : HttpResponse.json(feedPage([])),
      ),
    )
    renderRoute('/feed')
    await userEvent.click(await screen.findByRole('tab', { name: 'Following' }))

    await screen.findByText('Followed one')
    expect(screen.getByText('2 posts')).toBeInTheDocument()
    expect(screen.getByText(/^New since /)).toBeInTheDocument()
  })

  // ── The rail ──────────────────────────────────────────────────────────────

  it('renders the activity strip from GET /feed/activity', async () => {
    server.use(
      http.get('*/feed/activity', () =>
        HttpResponse.json({
          items: [
            {
              actor: { id: 'a9', username: 'nadia', profileImageUrl: null },
              kind: 'Saved',
              recipeId: 'lead',
              recipeTitle: 'Lead tomato tart',
              occurredAt: '2026-07-01T00:00:00Z',
            },
          ],
        }),
      ),
      http.get('*/feed', () => HttpResponse.json(feedPage(fourPosts()))),
    )
    renderRoute('/feed')
    await screen.findByText('Lead tomato tart')

    const strip = (await screen.findByText('COOKING RIGHT NOW')).closest('section')!
    expect(within(strip).getByText('nadia')).toBeInTheDocument()
    expect(within(strip).getByText(/saved/)).toBeInTheDocument()
  })

  // The old rail's cook rows said "In your feed" for everyone. The redesign's
  // promise is that each row states WHY — and the strongest honest signal is
  // how many of that cook's recipes the caller already saved.
  it('gives each suggested cook a computed reason', async () => {
    server.use(
      http.get('*/feed', () =>
        HttpResponse.json(
          feedPage([makeItem({ author: { id: 'cook-9', username: 'mira_cooks', profileImageUrl: null } }, { id: 's1', title: 'Suggested stew' })]),
        ),
      ),
      http.get('*/users/me/saved-recipes', () =>
        HttpResponse.json({ items: [makeRecipe({ id: 'sv1', createdByUserId: 'cook-9' })], nextCursor: null }),
      ),
    )
    renderRoute('/feed')
    await screen.findByText('Suggested stew')

    const module = (await screen.findByText('COOKS WHO SHARE YOUR TASTE')).closest('section')!
    expect(within(module).getByText('mira_cooks')).toBeInTheDocument()
    expect(within(module).getByText('you saved 1 of their recipe')).toBeInTheDocument()
    expect(within(module).getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })

  it('follows a suggested cook through the shared optimistic mutation', async () => {
    const follows: string[] = []
    server.use(
      http.get('*/feed', () =>
        HttpResponse.json(
          feedPage([makeItem({ author: { id: 'cook-7', username: 'jules_eats', profileImageUrl: null } }, { id: 's2', title: 'Followable fish' })]),
        ),
      ),
      http.post('*/users/:id/follow', ({ params }) => {
        follows.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/feed')
    await screen.findByText('Followable fish')

    const module = (await screen.findByText('COOKS WHO SHARE YOUR TASTE')).closest('section')!
    await userEvent.click(within(module).getByRole('button', { name: 'Follow' }))
    expect(follows).toEqual(['cook-7'])
  })
})
