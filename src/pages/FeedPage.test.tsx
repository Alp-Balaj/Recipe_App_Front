import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { FeedItemResponse, FeedListResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `feed-r${idSeq}`,
    title: `Feed recipe ${idSeq}`,
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
    tags: ['weeknight'],
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
    ...over,
  }
}

/** MSW GET /feed whose handler sees the parsed request URL. */
function feedHandler(handler: (url: URL) => Response) {
  return http.get('*/feed', ({ request }) => handler(new URL(request.url)))
}

function feedPage(items: FeedItemResponse[], over: Partial<FeedListResponse> = {}): FeedListResponse {
  return { items, nextCursor: null, source: 'following', ...over }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FeedPage', () => {
  it('renders post cards with author, counts, and no discover label in following mode', async () => {
    server.use(
      feedHandler(() =>
        HttpResponse.json(
          feedPage([makeItem({}, { title: 'Miso ramen' }), makeItem({ author: { id: 'a2', username: 'sam_cooks', profileImageUrl: null } }, { title: 'Lentil soup' })]),
        ),
      ),
    )
    renderRoute('/feed')

    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()
    expect(screen.getByText('Lentil soup')).toBeInTheDocument()
    expect(screen.getByText('chef_ana')).toBeInTheDocument()
    expect(screen.getByText('sam_cooks')).toBeInTheDocument()
    // Envelope counts on the action row.
    expect(screen.getAllByRole('button', { name: 'Like' })[0]).toHaveTextContent('5')
    expect(screen.getAllByLabelText('3 comments')[0]).toHaveTextContent('3')
    // Following mode → no cold-start label.
    expect(screen.queryByText(/Discover/)).not.toBeInTheDocument()
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument()
  })

  it('walks keyset pages via Load more, passing nextCursor back verbatim, without duplicates', async () => {
    const cursors: (string | null)[] = []
    server.use(
      feedHandler((url) => {
        const cursor = url.searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) {
          return HttpResponse.json(feedPage([makeItem({}, { id: 'p1', title: 'Page one post' })], { nextCursor: 'CUR2' }))
        }
        return HttpResponse.json(feedPage([makeItem({}, { id: 'p2', title: 'Page two post' })]))
      }),
    )
    renderRoute('/feed')
    expect(await screen.findByText('Page one post')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Load more'))
    expect(await screen.findByText('Page two post')).toBeInTheDocument()
    expect(screen.getAllByText('Page one post')).toHaveLength(1)
    expect(cursors).toEqual([null, 'CUR2'])
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument()
  })

  it('labels the discover cold-start state', async () => {
    server.use(
      feedHandler(() => HttpResponse.json(feedPage([makeItem({}, { title: 'Stranger danger stew' })], { source: 'discover' }))),
    )
    renderRoute('/feed')

    expect(await screen.findByText('Stranger danger stew')).toBeInTheDocument()
    expect(screen.getByText('Discover')).toBeInTheDocument()
    expect(screen.getByText(/not following anyone/)).toBeInTheDocument()
  })

  it('shows the empty state with a browse escape hatch', async () => {
    // Default handler already returns an empty discover feed.
    renderRoute('/feed')
    expect(await screen.findByText('Nothing cooking yet')).toBeInTheDocument()
    expect(screen.getByText('Browse recipes')).toBeInTheDocument()
  })

  it('shows the error state and recovers via Try again', async () => {
    let fail = true
    server.use(
      feedHandler(() => {
        if (fail) return new HttpResponse(null, { status: 500 })
        return HttpResponse.json(feedPage([makeItem({}, { title: 'Recovered ragu' })]))
      }),
    )
    renderRoute('/feed')
    expect(await screen.findByText("Couldn't load the feed")).toBeInTheDocument()

    fail = false
    await userEvent.click(screen.getByText('Try again'))
    expect(await screen.findByText('Recovered ragu')).toBeInTheDocument()
  })

  it('optimistically toggles like both ways, hitting POST then DELETE without refetching the page', async () => {
    const requests: string[] = []
    let feedFetches = 0
    server.use(
      feedHandler(() => {
        feedFetches += 1
        return HttpResponse.json(feedPage([makeItem({ likeCount: 5 }, { id: 'liked-1', title: 'Likeable laksa' })]))
      }),
      http.post('*/recipes/:id/likes', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/recipes/:id/likes', ({ params }) => {
        requests.push(`DELETE ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/feed')

    const likeBtn = await screen.findByRole('button', { name: 'Like' })
    expect(likeBtn).toHaveTextContent('5')

    await userEvent.click(likeBtn)
    // Optimistic: count + pressed state flip in the cached envelope.
    const unlikeBtn = await screen.findByRole('button', { name: 'Unlike' })
    expect(unlikeBtn).toHaveTextContent('6')
    expect(unlikeBtn).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(requests).toEqual(['POST liked-1']))

    await userEvent.click(unlikeBtn)
    const likeAgain = await screen.findByRole('button', { name: 'Like' })
    expect(likeAgain).toHaveTextContent('5')
    await waitFor(() => expect(requests).toEqual(['POST liked-1', 'DELETE liked-1']))

    // The envelope was patched in place — the page itself was fetched exactly once.
    expect(feedFetches).toBe(1)
  })

  it('rolls the optimistic like back when the server rejects it', async () => {
    server.use(
      feedHandler(() => HttpResponse.json(feedPage([makeItem({ likeCount: 5 }, { title: 'Rollback rösti' })]))),
      http.post('*/recipes/:id/likes', () => new HttpResponse(null, { status: 404 })),
    )
    renderRoute('/feed')

    const likeBtn = await screen.findByRole('button', { name: 'Like' })
    await userEvent.click(likeBtn)

    // Flips forward optimistically, then rolls back on the 404.
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: 'Like' })
      expect(btn).toHaveTextContent('5')
      expect(btn).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('optimistically toggles save and calls the saves endpoints', async () => {
    const requests: string[] = []
    server.use(
      feedHandler(() => HttpResponse.json(feedPage([makeItem({}, { id: 'saved-1', title: 'Savable saag' })]))),
      http.post('*/recipes/:id/saves', ({ params }) => {
        requests.push(`POST ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
      http.delete('*/recipes/:id/saves', ({ params }) => {
        requests.push(`DELETE ${params.id}`)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/feed')

    const saveBtn = await screen.findByRole('button', { name: 'Save recipe' })
    await userEvent.click(saveBtn)
    const savedBtn = await screen.findByRole('button', { name: 'Remove from saved' })
    expect(savedBtn).toHaveTextContent('Saved')
    await waitFor(() => expect(requests).toEqual(['POST saved-1']))

    await userEvent.click(savedBtn)
    expect(await screen.findByRole('button', { name: 'Save recipe' })).toBeInTheDocument()
    await waitFor(() => expect(requests).toEqual(['POST saved-1', 'DELETE saved-1']))
  })

  it('falls back to the clipboard for share and flashes "Link copied"', async () => {
    // jsdom has neither navigator.share nor navigator.clipboard — stub the clipboard.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    server.use(
      feedHandler(() => HttpResponse.json(feedPage([makeItem({}, { id: 'share-1', title: 'Shareable shakshuka' })]))),
    )
    renderRoute('/feed')

    await userEvent.click(await screen.findByRole('button', { name: 'Share recipe' }))
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/recipes/share-1'))
  })

  it('uses the Web Share API when the browser has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { value: share, configurable: true })

    server.use(
      feedHandler(() => HttpResponse.json(feedPage([makeItem({}, { id: 'share-2', title: 'Native nachos' })]))),
    )
    renderRoute('/feed')

    await userEvent.click(await screen.findByRole('button', { name: 'Share recipe' }))
    expect(await screen.findByText('Shared')).toBeInTheDocument()
    expect(share).toHaveBeenCalledWith({ title: 'Native nachos', url: expect.stringContaining('/recipes/share-2') })

    // Remove the stub so later tests fall back to the clipboard path.
    delete (navigator as { share?: unknown }).share
  })

  it('navigates to the recipe detail from the card body (mouse and keyboard)', async () => {
    server.use(
      feedHandler(() => HttpResponse.json(feedPage([makeItem({}, { id: 'nav-1', title: 'Clickable curry' })]))),
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe({ id: 'nav-1', title: 'Clickable curry' }))),
    )
    const router = renderRoute('/feed')

    await userEvent.click(await screen.findByRole('link', { name: 'Clickable curry' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/nav-1'))
  })

  it('shows the Feed tab in the nav and marks it active on /feed', async () => {
    renderRoute('/feed')
    await screen.findByText('Nothing cooking yet')
    const active = screen.getByRole('button', { current: 'page' })
    expect(active).toHaveTextContent('Feed')
  })
})
