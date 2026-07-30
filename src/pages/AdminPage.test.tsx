// stream D (governor): the admin surface — role gate, the three counts, the
// queue, and one triage action end-to-end against MSW.
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, makeAuthValue, TEST_ADMIN } from '@/test/utils'

function mockAdminEndpoints(overrides: { openReports?: number } = {}) {
  server.use(
    http.get('*/admin/overview', () =>
      HttpResponse.json({ totalUsers: 12, totalRecipes: 34, openReports: overrides.openReports ?? 2 }),
    ),
    http.get('*/admin/reports', () =>
      HttpResponse.json({
        items: [
          {
            id: 'rep-1',
            targetType: 'Recipe',
            targetId: 'rec-1',
            targetSummary: 'Recipe: Suspicious Stew',
            reason: 'Spam',
            details: 'Reads like an ad.',
            status: 'Open',
            createdAt: '2026-07-30T00:00:00Z',
            reporter: { id: 'u2', username: 'watchful_sam', profileImageUrl: null },
            resolvedAtUtc: null,
            resolvedByUsername: null,
            resolutionNote: null,
          },
        ],
        nextCursor: null,
      }),
    ),
    http.get('*/admin/audit', () => HttpResponse.json({ items: [], nextCursor: null })),
  )
}

describe('AdminPage', () => {
  it('denies a non-admin with a full-page block', async () => {
    renderRoute('/admin')

    expect(await screen.findByText('Admins only')).toBeInTheDocument()
    expect(screen.queryByText('Open reports')).not.toBeInTheDocument()
  })

  it('shows the three counts and the open queue for an admin', async () => {
    mockAdminEndpoints()
    renderRoute('/admin', { auth: makeAuthValue({ user: TEST_ADMIN }) })

    expect(await screen.findByText('Open reports')).toBeInTheDocument()
    expect(await screen.findByText('34')).toBeInTheDocument()
    expect(await screen.findByText('Recipe: Suspicious Stew')).toBeInTheDocument()
    expect(screen.getByText(/watchful_sam/)).toBeInTheDocument()
  })

  it('resolving a report POSTs to the resolve endpoint', async () => {
    mockAdminEndpoints()
    let resolved = false
    server.use(
      http.post('*/admin/reports/rep-1/resolve', () => {
        resolved = true
        return HttpResponse.json({
          id: 'rep-1',
          targetType: 'Recipe',
          targetId: 'rec-1',
          targetSummary: 'Recipe: Suspicious Stew',
          reason: 'Spam',
          details: null,
          status: 'Resolved',
          createdAt: '2026-07-30T00:00:00Z',
          reporter: { id: 'u2', username: 'watchful_sam', profileImageUrl: null },
          resolvedAtUtc: '2026-07-30T01:00:00Z',
          resolvedByUsername: 'testadmin',
          resolutionNote: null,
        })
      }),
    )

    renderRoute('/admin', { auth: makeAuthValue({ user: TEST_ADMIN }) })
    await screen.findByText('Recipe: Suspicious Stew')

    await userEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    await waitFor(() => expect(resolved).toBe(true))
  })
})
