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
import { http, HttpResponse } from 'msw'
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

  it('switching tabs clears the selection', async () => {
    setViewport(true)
    server.use(
      http.get('*/users/:id/following', () => HttpResponse.json({ items: [], nextCursor: null })),
    )
    const router = renderRoute('/users/target-1/followers?u=u1')

    // Confirm the selection actually took hold before switching, so clearing it means something.
    await waitFor(() => expect(router.state.location.search).toBe('?u=u1'))
    expect(await screen.findByRole('link', { name: /View full profile/ })).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('link', { name: 'Following' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/users/target-1/following'))
    expect(router.state.location.search).toBe('')
    expect(screen.queryByRole('link', { name: /View full profile/ })).not.toBeInTheDocument()
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
})
