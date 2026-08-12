// The triage queue's context line. Covers the branch that the 500-on-/admin/reports
// bug lived behind: a report whose target row is gone arrives with targetAuthor
// null, and the card must still render off the snapshot instead of dereferencing it.
//
// MSW at the network layer via renderRoute, same idiom as the rest of the admin folder.
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeAuthValue, renderRoute, TEST_ADMIN } from '@/test/utils'
import type { AdminReportListItem, AdminReportListResponse } from '@/api/admin'

function makeItem(over: Partial<AdminReportListItem> = {}): AdminReportListItem {
  return {
    report: {
      id: 'report-1',
      targetType: 'Comment',
      targetId: 'comment-1',
      targetSummary: 'Comment by chefsam: Rude remark.',
      reason: 'Harassment',
      details: null,
      status: 'Open',
      createdAt: '2026-08-01T00:00:00Z',
      reporter: { id: 'user-2', username: 'reporter' },
      resolvedAtUtc: null,
      resolvedByUsername: null,
      resolutionNote: null,
      source: 'Human',
      confidence: null,
    },
    reporter: { id: 'user-2', username: 'reporter' },
    targetAuthor: { id: 'user-1', username: 'chefsam', totalReportsAgainst: 3 },
    ...over,
  }
}

function reportsHandler(items: AdminReportListItem[]) {
  return http.get('*/admin/reports', () =>
    HttpResponse.json<AdminReportListResponse>({ items, nextCursor: null }),
  )
}

function renderReportsTab() {
  return renderRoute('/admin/reports', { auth: makeAuthValue({ user: TEST_ADMIN }) })
}

describe('AdminReportsTab', () => {
  it('names the target author and their running tally', async () => {
    server.use(reportsHandler([makeItem()]))

    renderReportsTab()

    expect(await screen.findByText(/against chefsam/)).toBeInTheDocument()
    expect(screen.getByText(/3 reports total/)).toBeInTheDocument()
  })

  it('renders a report whose target has been removed, with no author to name', async () => {
    // What the server sends once an admin removes the reported comment: the report
    // survives, its target FK does not.
    server.use(
      reportsHandler([
        makeItem({
          report: { ...makeItem().report, targetId: null },
          targetAuthor: null,
        }),
      ]),
    )

    renderReportsTab()

    // The snapshot is what keeps the row triageable.
    expect(await screen.findByText(/Rude remark\./)).toBeInTheDocument()
    expect(screen.getByText(/target since removed/)).toBeInTheDocument()
    expect(screen.queryByText(/reports total/)).not.toBeInTheDocument()
  })
})
