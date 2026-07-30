import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { getMealPlanForWeek, weekStartOf, addMealPlanEntry, getGroceryInsight } from './mealPlans'

describe('weekStartOf', () => {
  it('returns the Monday UTC midnight of the given date, as an ISO string', () => {
    // 2026-07-23 is a Thursday; its week starts Monday 2026-07-20.
    expect(weekStartOf(new Date('2026-07-23T15:04:05Z'))).toBe('2026-07-20T00:00:00.000Z')
  })

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-07-26 is a Sunday; it belongs to the week starting 2026-07-20.
    expect(weekStartOf(new Date('2026-07-26T23:59:00Z'))).toBe('2026-07-20T00:00:00.000Z')
  })

  it('returns the same day when given a Monday', () => {
    expect(weekStartOf(new Date('2026-07-20T00:00:00Z'))).toBe('2026-07-20T00:00:00.000Z')
  })
})

describe('meal plan fetchers', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: () => Promise.resolve(JSON.stringify(body)),
      json: () => Promise.resolve(body),
    } as unknown as Response)
  }

  it('getMealPlanForWeek passes weekStart and returns the single match', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({ items: [{ id: 'p1', weekStartDate: '2026-07-20T00:00:00Z', createdAt: '2026-07-19T00:00:00Z', entryCount: 2 }], nextCursor: null }),
    )

    const plan = await getMealPlanForWeek('2026-07-20T00:00:00.000Z')

    expect(fetchMock).toHaveBeenCalledOnce()
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/api/meal-plans')
    expect(url).toContain('weekStart=2026-07-20T00%3A00%3A00.000Z')
    expect(plan?.id).toBe('p1')
  })

  it('getMealPlanForWeek returns null when the week has no plan', async () => {
    fetchMock.mockReturnValue(jsonResponse({ items: [], nextCursor: null }))

    await expect(getMealPlanForWeek('2026-07-20T00:00:00.000Z')).resolves.toBeNull()
  })

  it('addMealPlanEntry POSTs day, meal type and recipe id', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({ id: 'e1', dayOfWeek: 'Monday', mealType: 'Breakfast', recipe: { id: 'r1', title: 'Toast', imageUrl: null } }, 201),
    )

    await addMealPlanEntry('p1', { dayOfWeek: 'Monday', mealType: 'Breakfast', recipeId: 'r1' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/meal-plans/p1/entries')
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      dayOfWeek: 'Monday',
      mealType: 'Breakfast',
      recipeId: 'r1',
    })
  })

  // Replaces the retired setShoppingListItemPurchased case: the /shopping-list
  // writes moved to api/shopping.ts (week/shopping rework), and this endpoint
  // arrived in the same plan as their replacement.
  it('getGroceryInsight GETs one plan\'s insight', async () => {
    fetchMock.mockReturnValue(
      jsonResponse({ distinctIngredientCount: 12, sharedIngredientCount: 3, outlier: null }),
    )

    const insight = await getGroceryInsight('p1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/meal-plans/p1/grocery-insight')
    expect((init as RequestInit).method).toBe('GET')
    expect(insight.sharedIngredientCount).toBe(3)
  })
})
