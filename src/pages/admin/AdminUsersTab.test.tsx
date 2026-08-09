// Admin Rework (stream FE-2, Task 16) — the Users tab: search + status/sort
// filters over the offset-paged roster. Mocked at the network layer with MSW
// (server.use(...) overrides via renderRoute), matching the rest of the admin
// folder's tests and BrowsePage's established search-debounce pattern, rather
// than vi.mock (nothing else in this codebase uses it).
//
// The debounce assertion runs on REAL timers, same rationale as BrowsePage's
// "BrowsePage search" describe block: renderRoute mounts a route that loads
// over MSW, and waitFor/findBy deadlock against fake timers (they poll on the
// very timers being faked). The debounce is 300ms and asyncUtilTimeout is
// raised to 5000ms globally (src/test/setup.ts), so real timers cover it
// comfortably without flaking.
import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeAuthValue, renderRoute, TEST_ADMIN } from '@/test/utils'
import type { AdminUserListItem, AdminUserListResponse } from '@/api/admin'

let idSeq = 0
function makeUser(over: Partial<AdminUserListItem> = {}): AdminUserListItem {
  idSeq += 1
  return {
    id: `user-${idSeq}`,
    username: `chef${idSeq}`,
    email: `chef${idSeq}@example.com`,
    role: 'User',
    isBanned: false,
    suspendedUntilUtc: null,
    createdAt: '2026-01-01T00:00:00Z',
    allTimeTokens: 1200,
    ...over,
  }
}

function listPage(items: AdminUserListItem[], over: Partial<AdminUserListResponse> = {}): AdminUserListResponse {
  return { items, page: 1, totalPages: 1, totalCount: items.length, ...over }
}

/** MSW GET /admin/users that records the requested URL for assertions. */
function usersHandler(handler: (url: URL) => AdminUserListResponse) {
  return http.get('*/admin/users', ({ request }) => HttpResponse.json(handler(new URL(request.url))))
}

function renderUsersTab() {
  return renderRoute('/admin/users', { auth: makeAuthValue({ user: TEST_ADMIN }) })
}

describe('AdminUsersTab', () => {
  it('links each row to its detail page', async () => {
    server.use(usersHandler(() => listPage([makeUser({ id: 'user-42', username: 'chefsam' })])))

    renderUsersTab()

    const link = await screen.findByRole('link', { name: /chefsam/i })
    expect(link).toHaveAttribute('href', '/admin/users/user-42')
  })

  it('shows the empty state when nothing matches', async () => {
    server.use(usersHandler(() => listPage([])))

    renderUsersTab()

    expect(await screen.findByText('No users match.')).toBeInTheDocument()
  })

  it('shows the banned state and right-aligned token count on a row', async () => {
    server.use(usersHandler(() => listPage([makeUser({ username: 'chefsam', isBanned: true, allTimeTokens: 54321 })])))

    renderUsersTab()

    await screen.findByText('chefsam')
    expect(screen.getByText('54,321')).toBeInTheDocument()
    // Two: the always-present 'Banned' status filter chip, and this row's state line.
    expect(screen.getAllByText('Banned')).toHaveLength(2)
  })

  it('surfaces a load failure with a working retry', async () => {
    let calls = 0
    server.use(
      http.get('*/admin/users', () => {
        calls += 1
        if (calls === 1) return HttpResponse.json({ title: 'Server error' }, { status: 500 })
        return HttpResponse.json(listPage([makeUser({ username: 'recovered' })]))
      }),
    )

    renderUsersTab()

    await screen.findByText(/Couldn't load users/)
    fireEvent.click(screen.getByText('Try again'))

    await screen.findByText('recovered')
    expect(calls).toBe(2)
  })

  it('debounces search and only sends the picked status chip once the window elapses', async () => {
    const urls: string[] = []
    server.use(
      usersHandler((url) => {
        urls.push(url.search)
        return listPage([makeUser({ username: 'chefsam' })])
      }),
    )

    renderUsersTab()
    await screen.findByText('chefsam')
    const initial = urls.length

    // Change the search text and pick the Banned chip with no await between —
    // the status chip is not debounced, but the search term is, so the
    // combined { search: 'sam', status: 'banned' } request must not exist yet.
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'sam' } })
    fireEvent.click(screen.getByRole('button', { name: 'Banned' }))
    expect(urls.some((u) => u.includes('search=sam') && u.includes('status=banned'))).toBe(false)

    await waitFor(() => expect(urls.some((u) => u.includes('search=sam') && u.includes('status=banned'))).toBe(true))

    // Settle well past the debounce window and confirm no straggler keystroke
    // requests followed — only the settled combination went out.
    await new Promise((resolve) => setTimeout(resolve, 400))
    const settledCount = urls.length
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(urls.length).toBe(settledCount)
    expect(urls.length).toBeGreaterThan(initial)
  })
})
