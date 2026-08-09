// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (FE-3, Task 17) — the Events tab's app-events pane. The audit
// pane + toggle are pre-existing (Task 6) and untouched, so this file only
// exercises the events pane: category-chip refetching and row rendering.
//
// Mocking approach: MSW, matching every other test in this codebase (no test
// anywhere in src/ uses vi.mock for API modules) rather than the plan's
// suggested vi.mock('../../api') — see the FE-3 report for this deviation.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute, makeAuthValue, TEST_ADMIN } from '@/test/utils'
import type { AdminEventEntry } from '@/api/admin'

function makeEvent(overrides: Partial<AdminEventEntry> = {}): AdminEventEntry {
  return {
    id: 'e1',
    category: 'Content',
    type: 'RecipeCreated',
    actorUsername: 'chef1',
    targetId: 'r1',
    detail: null,
    createdAt: '2026-08-09T00:00:00Z',
    ...overrides,
  }
}

function renderEventsTab() {
  return renderRoute('/admin/events', { auth: makeAuthValue({ user: TEST_ADMIN }) })
}

describe('AdminEventsTab — events pane', () => {
  it('switches to the events pane and requests the Ai category when that chip is picked', async () => {
    const seenCategories: (string | null)[] = []
    server.use(
      http.get('*/admin/events', ({ request }) => {
        const url = new URL(request.url)
        seenCategories.push(url.searchParams.get('category'))
        return HttpResponse.json({
          items: [
            makeEvent({
              id: 'e-ai',
              category: 'Ai',
              type: 'AiCallFailed',
              actorUsername: 'chef1',
              detail: 'timeout after 30s',
            }),
          ],
          nextCursor: null,
        })
      }),
    )

    renderEventsTab()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'App events' }))

    // Initial load: no category filter (All).
    await waitFor(() => expect(seenCategories.length).toBeGreaterThan(0))
    expect(seenCategories[0]).toBeNull()

    await user.click(screen.getByRole('button', { name: 'AI' }))

    await waitFor(() => expect(seenCategories).toContain('Ai'))
    expect(screen.getByText('AI call failed')).toBeInTheDocument()
    expect(screen.getByText('timeout after 30s', { exact: false })).toBeInTheDocument()
  })

  it('renders a human description, actor and detail for a row', async () => {
    server.use(
      http.get('*/admin/events', () =>
        HttpResponse.json({
          items: [
            makeEvent({
              id: 'e-report',
              category: 'Content',
              type: 'ReportFiled',
              actorUsername: 'reporter1',
              detail: 'reason: spam',
            }),
          ],
          nextCursor: null,
        }),
      ),
    )

    renderEventsTab()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'App events' }))

    await waitFor(() => expect(screen.getByText('filed a report')).toBeInTheDocument())
    expect(screen.getByText('reporter1')).toBeInTheDocument()
    expect(screen.getByText('reason: spam', { exact: false })).toBeInTheDocument()
  })

  it('shows the empty state when there are no events', async () => {
    server.use(http.get('*/admin/events', () => HttpResponse.json({ items: [], nextCursor: null })))

    renderEventsTab()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'App events' }))

    await waitFor(() => expect(screen.getByText('Nothing logged yet.')).toBeInTheDocument())
  })
})
