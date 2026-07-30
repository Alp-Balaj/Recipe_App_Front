// open-loops slice 3 — the bell in the shell chrome and the /notifications page.
//
// The bell mounts for every signed-in render, so the default MSW handler answers
// zero; these tests override it. Guests never mount it at all.

import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderGuestRoute, renderRoute } from '@/test/utils'
import type { NotificationResponse } from '@/api/notifications'

let idSeq = 0
function makeNotification(over: Partial<NotificationResponse> = {}): NotificationResponse {
  idSeq += 1
  return {
    id: `n-${idSeq}`,
    type: 'RecipeLiked',
    actor: { id: 'actor-1', username: 'chef_ana', profileImageUrl: null },
    recipeId: 'recipe-1',
    recipeTitle: 'Miso ramen',
    commentId: null,
    createdAt: '2026-07-30T10:00:00.000Z',
    readAt: null,
    ...over,
  }
}

function givenNotifications(items: NotificationResponse[], unreadCount = items.filter((n) => !n.readAt).length) {
  server.use(
    http.get('*/notifications', () => HttpResponse.json({ items, nextCursor: null, unreadCount })),
    http.get('*/notifications/unread-count', () => HttpResponse.json({ unreadCount })),
  )
}

describe('the notification bell', () => {
  it('shows no badge when nothing is unread', async () => {
    givenNotifications([], 0)
    renderRoute('/discover')

    const bell = await screen.findByRole('link', { name: 'Notifications' })
    expect(bell).toBeInTheDocument()
  })

  it('names the unread count in its accessible label', async () => {
    givenNotifications([makeNotification(), makeNotification()], 2)
    renderRoute('/discover')

    expect(await screen.findByRole('link', { name: 'Notifications (2 unread)' })).toBeInTheDocument()
  })

  it('is not rendered for a guest', async () => {
    renderGuestRoute('/discover')
    await screen.findByText('Explore recipes')

    expect(screen.queryByRole('link', { name: /Notifications/ })).not.toBeInTheDocument()
  })

  it('navigates to the notifications page', async () => {
    givenNotifications([makeNotification({ recipeTitle: 'Clickable curry' })], 1)
    const router = renderRoute('/discover')

    await userEvent.click(await screen.findByRole('link', { name: 'Notifications (1 unread)' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/notifications'))
  })
})

describe('the notifications page', () => {
  it('phrases each type as a sentence', async () => {
    givenNotifications([
      makeNotification({ type: 'RecipeLiked', recipeTitle: 'Miso ramen' }),
      makeNotification({ type: 'RecipeCommented', recipeTitle: 'Lentil soup' }),
      makeNotification({ type: 'CommentLiked', recipeTitle: 'Focaccia' }),
      makeNotification({ type: 'UserFollowed', recipeId: null, recipeTitle: null }),
    ])
    renderRoute('/notifications')

    expect(await screen.findByText('chef_ana liked Miso ramen')).toBeInTheDocument()
    expect(screen.getByText('chef_ana commented on Lentil soup')).toBeInTheDocument()
    expect(screen.getByText('chef_ana liked your comment')).toBeInTheDocument()
    expect(screen.getByText('chef_ana followed you')).toBeInTheDocument()
  })

  it('falls back to "a recipe" when the recipe is gone, and drops the link', async () => {
    givenNotifications([makeNotification({ recipeId: null, recipeTitle: null })])
    renderRoute('/notifications')

    const line = await screen.findByText('chef_ana liked a recipe')
    // A tap that would land on a 404 is worse than no tap at all.
    expect(line.closest('a')).toBeNull()
  })

  it('links a recipe notification to the recipe', async () => {
    givenNotifications([makeNotification({ recipeId: 'r-9', recipeTitle: 'Linked laksa' })])
    renderRoute('/notifications')

    const line = await screen.findByText('chef_ana liked Linked laksa')
    expect(line.closest('a')).toHaveAttribute('href', '/recipes/r-9')
  })

  it('links a follow notification to the follower', async () => {
    givenNotifications([
      makeNotification({ type: 'UserFollowed', recipeId: null, recipeTitle: null }),
    ])
    renderRoute('/notifications')

    const line = await screen.findByText('chef_ana followed you')
    expect(line.closest('a')).toHaveAttribute('href', '/users/actor-1')
  })

  it('marks the page read on arrival, bounded by the newest row', async () => {
    const newest = '2026-07-30T12:00:00.000Z'
    const bodies: { upTo: string }[] = []
    server.use(
      http.get('*/notifications', () =>
        HttpResponse.json({
          items: [
            makeNotification({ createdAt: newest }),
            makeNotification({ createdAt: '2026-07-30T09:00:00.000Z' }),
          ],
          nextCursor: null,
          unreadCount: 2,
        }),
      ),
      http.get('*/notifications/unread-count', () => HttpResponse.json({ unreadCount: 2 })),
      http.put('*/notifications/read', async ({ request }) => {
        bodies.push((await request.json()) as { upTo: string })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/notifications')

    // Bounded by the newest row rather than "now", so anything arriving while
    // you read stays unread.
    await waitFor(() => expect(bodies).toEqual([{ upTo: newest }]))
  })

  it('does not mark read when everything is already read', async () => {
    let marks = 0
    server.use(
      http.get('*/notifications', () =>
        HttpResponse.json({
          items: [makeNotification({ readAt: '2026-07-30T11:00:00.000Z' })],
          nextCursor: null,
          unreadCount: 0,
        }),
      ),
      http.get('*/notifications/unread-count', () => HttpResponse.json({ unreadCount: 0 })),
      http.put('*/notifications/read', () => {
        marks += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderRoute('/notifications')

    await screen.findByText('chef_ana liked Miso ramen')
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(marks).toBe(0)
  })

  it('shows the empty state when there is nothing', async () => {
    givenNotifications([], 0)
    renderRoute('/notifications')

    expect(await screen.findByText('Nothing yet')).toBeInTheDocument()
  })

  // Already-read rows on purpose: marking read invalidates the list, and a
  // refetch mid-assertion made this race. Pagination is not the mark-read
  // path's business, so the test isolates it rather than waiting it out.
  it('walks keyset pages without duplicates', async () => {
    const read = '2026-07-30T09:30:00.000Z'
    server.use(
      http.get('*/notifications', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        if (!cursor) {
          return HttpResponse.json({
            items: [makeNotification({ recipeTitle: 'Page one dish', readAt: read })],
            nextCursor: 'NCUR2',
            unreadCount: 0,
          })
        }
        return HttpResponse.json({
          items: [makeNotification({ recipeTitle: 'Page two dish', readAt: read })],
          nextCursor: null,
          unreadCount: 0,
        })
      }),
    )
    renderRoute('/notifications')

    expect(await screen.findByText('chef_ana liked Page one dish')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('chef_ana liked Page two dish')).toBeInTheDocument()
    expect(screen.getAllByText(/chef_ana liked Page/)).toHaveLength(2)
  })

  // The cursor must reach the wire verbatim — the backend hands back an opaque
  // base64url token and re-encoding it would silently break paging.
  it('passes nextCursor back verbatim', async () => {
    const cursors: (string | null)[] = []
    server.use(
      http.get('*/notifications', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor')
        cursors.push(cursor)
        if (!cursor) {
          return HttpResponse.json({
            items: [makeNotification({ recipeTitle: 'First', readAt: '2026-07-30T09:30:00.000Z' })],
            nextCursor: 'OPAQUE==token',
            unreadCount: 0,
          })
        }
        return HttpResponse.json({ items: [], nextCursor: null, unreadCount: 0 })
      }),
    )
    renderRoute('/notifications')

    await screen.findByText('chef_ana liked First')
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(cursors).toEqual([null, 'OPAQUE==token']))
  })

  it('sends a guest to Discover with the login modal instead of an empty page', async () => {
    const router = renderGuestRoute('/notifications')

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    // The gate renders Discover underneath rather than redirecting.
    expect(router.state.location.pathname).toBe('/notifications')
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
  })

  it('surfaces a load failure with a retry', async () => {
    server.use(http.get('*/notifications', () => new HttpResponse(null, { status: 500 })))
    renderRoute('/notifications')

    expect(await screen.findByText("Couldn't load notifications")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('tints unread rows and leaves read ones plain', async () => {
    givenNotifications([
      makeNotification({ recipeTitle: 'Unread dish', readAt: null }),
      makeNotification({ recipeTitle: 'Read dish', readAt: '2026-07-30T09:30:00.000Z' }),
    ])
    renderRoute('/notifications')

    const unreadRow = (await screen.findByText('chef_ana liked Unread dish')).closest('a')!
    const readRow = screen.getByText('chef_ana liked Read dish').closest('a')!

    expect(unreadRow).toHaveStyle({ background: 'var(--chipbg)' })
    expect(readRow).toHaveStyle({ background: 'transparent' })
    // Unread is also carried by a dot, so it does not rely on colour alone.
    expect(within(unreadRow).getByText('', { selector: 'span[aria-hidden]' })).toBeInTheDocument()
  })
})
