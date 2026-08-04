import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { getShoppingList, setMark } from './shopping'

describe('shopping api', () => {
  it('sends scope and weekStart, and returns weeks with groups', async () => {
    let seen: URL | undefined
    server.use(
      http.get('/api/shopping-list', ({ request }) => {
        seen = new URL(request.url)
        return HttpResponse.json({
          weeks: [{
            weekStartDate: '2026-07-27T00:00:00Z',
            groups: [{
              key: 'flour',
              displayName: 'Flour',
              parts: [{ quantity: '2 cups', dishTitle: 'Pasta' }],
              dishes: ['Pasta'],
              isPurchased: false,
              origin: 'Derived',
              manualItemId: null,
              totals: [{ quantity: 480, unit: 'Millilitre', display: '480 ml' }],
            }],
            purchasedCount: 0,
            totalCount: 1,
          }],
          orphanedPurchasedNames: [],
        })
      }),
    )

    const list = await getShoppingList({ weekStart: '2026-07-27T00:00:00.000Z', scope: 'Week' })

    expect(seen?.searchParams.get('scope')).toBe('Week')
    expect(seen?.searchParams.get('weekStart')).toBe('2026-07-27T00:00:00.000Z')
    expect(list.weeks[0].groups[0].displayName).toBe('Flour')
  })

  it('PUTs an explicit mark rather than toggling', async () => {
    let body: unknown
    server.use(
      http.put('/api/shopping-list/marks', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await setMark({ weekStartDate: '2026-07-27T00:00:00.000Z', key: 'flour', isPurchased: true, isSuppressed: false })

    expect(body).toEqual({
      weekStartDate: '2026-07-27T00:00:00.000Z',
      key: 'flour',
      isPurchased: true,
      isSuppressed: false,
    })
  })
})
