// stream D (governor): wire-shape pin for the report endpoint — the request
// body carries PascalCase enum VALUES as strings and a null details when blank.
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { submitReport } from './reports'

describe('submitReport', () => {
  it('POSTs the target, reason and details to /reports', async () => {
    let seenBody: unknown = null
    server.use(
      http.post('*/reports', async ({ request }) => {
        seenBody = await request.json()
        return HttpResponse.json({
          id: 'r1',
          targetType: 'Recipe',
          targetId: 'abc',
          targetSummary: 'Recipe: Test',
          reason: 'Spam',
          details: 'ad',
          status: 'Open',
          createdAt: '2026-07-30T00:00:00Z',
          reporter: { id: 'u1', username: 'reporter', profileImageUrl: null },
          resolvedAtUtc: null,
          resolvedByUsername: null,
          resolutionNote: null,
        })
      }),
    )

    const result = await submitReport({
      targetType: 'Recipe',
      targetId: 'abc',
      reason: 'Spam',
      details: 'ad',
    })

    expect(seenBody).toEqual({
      targetType: 'Recipe',
      targetId: 'abc',
      reason: 'Spam',
      details: 'ad',
    })
    expect(result.status).toBe('Open')
    expect(result.targetSummary).toContain('Test')
  })
})
