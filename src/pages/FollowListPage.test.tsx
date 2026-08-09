// ─────────────────────────────────────────────────────────────────────────
// FollowListPage — /users/:id/followers and /users/:id/following.
//
// matchMedia note: setup.ts installs a GLOBAL stub (matches: false) only when
// jsdom has no matchMedia of its own, so it is a plain assignment, not a
// spy/mock vitest can stub-and-restore per test. The repo's existing pattern
// (FiltersSheet.test.tsx, ProfilePage.test.tsx) is to swap `window.matchMedia`
// directly for the duration of a test and restore the original in afterEach —
// that is what setViewport does here. `vi.stubGlobal` would layer a SECOND
// override on top of the module-level one and needs its own cleanup ordering
// against `resetHandlers`/`cleanup` in setup.ts; matching the proven pattern
// avoids fighting that interaction for no behavioural gain.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { queryKeys } from '@/api/queryKeys'
import { server } from '@/test/msw/server'
import { makeFollowUser, makeUserProfile } from '@/test/msw/handlers'
import { renderRoute } from '@/test/utils'

const realMatchMedia = window.matchMedia

function setViewport(isDesktop: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('1024') ? isDesktop : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

beforeEach(() => {
  server.use(
    http.get('*/users/:id/followers', () =>
      HttpResponse.json({
        items: [
          makeFollowUser({ id: 'u1', username: 'mira_cooks', recipeCount: 42 }),
          makeFollowUser({ id: 'u2', username: 'tobias', recipeCount: 7 }),
        ],
        nextCursor: null,
      }),
    ),
    http.get('*/users/:id', ({ params }) =>
      HttpResponse.json(makeUserProfile({ id: String(params.id), username: `user_${params.id}` })),
    ),
  )
})

describe('FollowListPage', () => {
  it('lists the followers with their recipe counts', async () => {
    setViewport(true)
    renderRoute('/users/target-1/followers')

    expect(await screen.findByText('mira_cooks')).toBeInTheDocument()
    expect(screen.getByText('42 recipes')).toBeInTheDocument()
  })

  it('on desktop, selecting a row writes ?u= and previews that cook', async () => {
    setViewport(true)
    const router = renderRoute('/users/target-1/followers')

    await userEvent.click(await screen.findByRole('button', { name: /mira_cooks/ }))

    await waitFor(() => expect(router.state.location.search).toBe('?u=u1'))
    // Proves the pane actually rendered the preview, not just that the URL changed.
    expect(await screen.findByRole('link', { name: /View full profile/ })).toBeInTheDocument()
  })

  it('on phone, selecting a row navigates to the profile instead (no ?u=, no pane)', async () => {
    setViewport(false)
    const router = renderRoute('/users/target-1/followers')

    await userEvent.click(await screen.findByRole('button', { name: /mira_cooks/ }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/users/u1'))
    // Proves this replaced the list (real navigation), not a desktop-style selection:
    // no ?u= was ever written and the preview pane never mounts on phone.
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('link', { name: /View full profile/ })).not.toBeInTheDocument()
  })

  it('switching tabs clears the selection AND the search term', async () => {
    setViewport(true)
    server.use(
      http.get('*/users/:id/following', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        // Unfiltered → a real row; filtered by a leaked "zzz" → nothing. So
        // whichever renders after the switch tells us directly whether the
        // term survived.
        return HttpResponse.json({
          items: q ? [] : [makeFollowUser({ id: 'u3', username: 'chandra', recipeCount: 3 })],
          nextCursor: null,
        })
      }),
    )
    const router = renderRoute('/users/target-1/followers?u=u1')

    // Confirm the selection actually took hold before switching, so clearing it means something.
    await waitFor(() => expect(router.state.location.search).toBe('?u=u1'))
    expect(await screen.findByRole('link', { name: /View full profile/ })).toBeInTheDocument()

    // Type a term and switch tabs immediately, BEFORE the 300ms debounce can
    // fire — this is the race the fix must close: a stale timer landing on
    // the Following tab and re-applying the old term via setQ.
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    await userEvent.click(await screen.findByRole('link', { name: 'Following' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/users/target-1/following'))
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('link', { name: /View full profile/ })).not.toBeInTheDocument()

    // The search box is empty and the Following tab's UNFILTERED list is
    // showing — not the filtered-to-nothing result a leaked "zzz" (whether
    // from surviving state or a stale debounce timer) would produce. This
    // `waitFor` runs well past 300ms, so a timer that fires late is caught.
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
    expect(await screen.findByText('chandra')).toBeInTheDocument()
  })

  it('clicking the preview pane\'s Followers count (a subject change, same kind) clears the search', async () => {
    setViewport(true)
    server.use(
      // Two different profiles' follower lists, both filterable by `q` — so a
      // leaked term from target-1 would silently filter u1's list too.
      http.get('*/users/:id/followers', ({ params, request }) => {
        const q = new URL(request.url).searchParams.get('q')?.toLowerCase()
        const byOwner: Record<string, ReturnType<typeof makeFollowUser>[]> = {
          'target-1': [
            makeFollowUser({ id: 'u1', username: 'mira_cooks', recipeCount: 42 }),
            makeFollowUser({ id: 'u2', username: 'tobias', recipeCount: 7 }),
          ],
          u1: [makeFollowUser({ id: 'u9', username: 'someone_else', recipeCount: 3 })],
        }
        const items = byOwner[String(params.id)] ?? []
        const filtered = q ? items.filter((u) => u.username.toLowerCase().includes(q)) : items
        return HttpResponse.json({ items: filtered, nextCursor: null })
      }),
      http.get('*/users/:id', ({ params }) =>
        HttpResponse.json(
          params.id === 'u1'
            ? makeUserProfile({ id: 'u1', username: 'mira_cooks', followerCount: 9 })
            : makeUserProfile({ id: String(params.id), username: `user_${params.id}` }),
        ),
      ),
    )
    const router = renderRoute('/users/target-1/followers')

    // Search for "mira" — the row stays visible because it matches, so
    // selecting it below doesn't itself prove anything about the filter.
    await userEvent.type(screen.getByRole('searchbox'), 'mira')
    await screen.findByText('mira_cooks')

    // Select the row so the preview pane renders for u1.
    await userEvent.click(screen.getByRole('button', { name: /mira_cooks/ }))
    expect(await screen.findByRole('link', { name: /View full profile/ })).toBeInTheDocument()

    // Click the PANE's Followers count (ProfileSummary's StatLink), not the
    // page's own Followers/Following tab — both have "Followers" in their
    // accessible name, so disambiguate by href (the pane's points at u1).
    const followersLinks = screen.getAllByRole('link', { name: /Followers/ })
    const paneStatLink = followersLinks.find((l) => l.getAttribute('href') === '/users/u1/followers')
    expect(paneStatLink).toBeTruthy()
    await userEvent.click(paneStatLink!)

    await waitFor(() => expect(router.state.location.pathname).toBe('/users/u1/followers'))
    // The search box must be empty...
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveValue(''))
    // ...and the newly-loaded list must be UNFILTERED: if "mira" had survived
    // the subject change, u1's list (which contains no "mira") would render
    // its empty state instead of "someone_else".
    expect(await screen.findByText('someone_else')).toBeInTheDocument()
  })

  it('distinguishes an empty search from an empty list', async () => {
    setViewport(true)
    server.use(
      http.get('*/users/:id/followers', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        return HttpResponse.json({
          items: q ? [] : [makeFollowUser({ id: 'u1', username: 'mira_cooks' })],
          nextCursor: null,
        })
      }),
    )
    renderRoute('/users/target-1/followers')

    await screen.findByText('mira_cooks')
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')

    expect(await screen.findByText('No one matching “zzz”', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText('No followers yet')).not.toBeInTheDocument()
  })

  it('debounces the search: rapid keystrokes fire one request, not one per keystroke', async () => {
    setViewport(true)
    let filteredRequests = 0
    server.use(
      http.get('*/users/:id/followers', ({ request }) => {
        const q = new URL(request.url).searchParams.get('q')
        if (q) filteredRequests += 1
        return HttpResponse.json({
          items: q ? [] : [makeFollowUser({ id: 'u1', username: 'mira_cooks' })],
          nextCursor: null,
        })
      }),
    )
    renderRoute('/users/target-1/followers')

    await screen.findByText('mira_cooks')
    // Three keystrokes in quick succession. Without debouncing, each of "z",
    // "zz", "zzz" would independently reach the query key and fire its own
    // request; with debouncing only the settled trailing value ("zzz") does.
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')

    await screen.findByText('No one matching “zzz”', {}, { timeout: 3000 })
    // Give any (incorrectly) un-debounced intermediate requests time to land
    // before counting.
    await waitFor(() => expect(filteredRequests).toBeGreaterThanOrEqual(1))

    expect(filteredRequests).toBe(1)
  })

  it('following from a row updates the row and the pane together', async () => {
    setViewport(true)
    server.use(
      http.get('*/users/:id/followers', () =>
        HttpResponse.json({
          items: [makeFollowUser({ id: 'u1', username: 'mira_cooks', followedByMe: false })],
          nextCursor: null,
        }),
      ),
      http.get('*/users/:id', ({ params }) =>
        HttpResponse.json(
          makeUserProfile({ id: String(params.id), username: 'mira_cooks', followedByMe: false }),
        ),
      ),
      http.post('*/users/:id/follow', () => new HttpResponse(null, { status: 204 })),
    )
    renderRoute('/users/target-1/followers?u=u1')

    // The pane's control and the row's control both start unfollowed.
    await waitFor(() => expect(screen.getAllByText('Follow').length).toBe(2))

    await userEvent.click(screen.getAllByText('Follow')[0])

    // Both flip. If only one does, the caches disagreed.
    await waitFor(() => expect(screen.queryByText('Follow')).not.toBeInTheDocument())
    expect(screen.getAllByText(/Following/).length).toBeGreaterThanOrEqual(2)
  })

  it('a single follow action patches every cached follow list, not just the one on screen', async () => {
    setViewport(true)
    server.use(
      http.get('*/users/:id/followers', () =>
        HttpResponse.json({
          items: [makeFollowUser({ id: 'u1', username: 'mira_cooks', followedByMe: false })],
          nextCursor: null,
        }),
      ),
      http.get('*/users/:id', ({ params }) =>
        HttpResponse.json(
          makeUserProfile({ id: String(params.id), username: 'mira_cooks', followedByMe: false }),
        ),
      ),
      http.post('*/users/:id/follow', () => new HttpResponse(null, { status: 204 })),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    // A follow list belonging to a DIFFERENT profile the reader visited earlier —
    // seeded directly, never mounted by this render. The property under test is
    // that the predicate reaches caches like this one, not just the one on screen;
    // a key-based patch scoped to the visible route (target-1's followers) would
    // leave this one stale.
    client.setQueryData(queryKeys.users.following('target-2', ''), {
      pageParams: [undefined],
      pages: [
        {
          items: [makeFollowUser({ id: 'u1', username: 'mira_cooks', followedByMe: false })],
          nextCursor: null,
        },
      ],
    })

    renderRoute('/users/target-1/followers?u=u1', { client })

    await waitFor(() => expect(screen.getAllByText('Follow').length).toBe(2))
    await userEvent.click(screen.getAllByText('Follow')[0])
    await waitFor(() => expect(screen.queryByText('Follow')).not.toBeInTheDocument())

    const other = client.getQueryData<{ pages: Array<{ items: Array<{ id: string; followedByMe: boolean }> }> }>(
      queryKeys.users.following('target-2', ''),
    )
    expect(other?.pages[0].items[0].followedByMe).toBe(true)
  })

  it('a failed follow request rolls back the row AND the pane together', async () => {
    setViewport(true)
    server.use(
      http.get('*/users/:id/followers', () =>
        HttpResponse.json({
          items: [makeFollowUser({ id: 'u1', username: 'mira_cooks', followedByMe: false })],
          nextCursor: null,
        }),
      ),
      http.get('*/users/:id', ({ params }) =>
        HttpResponse.json(
          makeUserProfile({ id: String(params.id), username: 'mira_cooks', followedByMe: false }),
        ),
      ),
      http.post('*/users/:id/follow', () => new HttpResponse(null, { status: 500 })),
    )
    renderRoute('/users/target-1/followers?u=u1')

    await waitFor(() => expect(screen.getAllByText('Follow').length).toBe(2))
    await userEvent.click(screen.getAllByText('Follow')[0])

    // The optimistic patch lands on both caches, then the 500 rolls BOTH back —
    // the row and the pane must both read "Follow" again, not just one of them.
    await waitFor(() => expect(screen.getAllByText('Follow').length).toBe(2))
  })
})
