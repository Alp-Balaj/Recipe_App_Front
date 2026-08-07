import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { PantryScanResponse, ReceiptScanResponse } from '@/api/scan'

// ─────────────────────────────────────────────────────────────────────────
// /scan — stream N, re-pointed at the Scan redesign's guided flow.
//
// The assertions worth having pin the two honesty promises the backend makes:
// an empty detection is an EMPTY state (never an invented pantry), and an
// unresolved detection is SHOWN as unknown rather than dropped. Plus the one
// piece of workflow that must not regress — a receipt draft writes NOTHING
// until the user confirms, and confirming posts each kept line through the
// existing manual-add endpoint.
//
// The redesign moved the mode out of component state and into the URL: bare
// /scan is now the intent picker, and a job's capture screen lives at
// ?mode=pantry / ?mode=receipt (the same params the page already read). Tests
// that want a capture screen therefore ask for one by URL.
// ─────────────────────────────────────────────────────────────────────────

const BUDGET = {
  dailyCallLimit: 50,
  callsUsed: 1,
  callsRemaining: 49,
  dailyTokenLimit: 250000,
  tokensUsed: 210,
  tokensRemaining: 249790,
  resetsAtUtc: '2026-08-08T00:00:00Z',
}

const RECIPE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function pantryResponse(overrides: Partial<PantryScanResponse> = {}): PantryScanResponse {
  return {
    detected: [
      { name: 'flour', ingredientId: '11111111-1111-1111-1111-111111111111', catalogueName: 'Wheat flour' },
      { name: 'haskap berries', ingredientId: null, catalogueName: null },
    ],
    matches: [
      {
        recipeId: RECIPE_ID,
        title: 'Shortbread',
        imageUrl: null,
        totalTimeMinutes: 30,
        caloriesPerServing: null,
        matchedIngredientCount: 2,
        totalIngredientCount: 3,
        matchedIngredientNames: ['flour', 'butter'],
        missingIngredientNames: ['caster sugar'],
      },
    ],
    budget: BUDGET,
    ...overrides,
  }
}

function receiptResponse(): ReceiptScanResponse {
  return {
    items: [
      { name: 'Whole milk', quantity: '2 x 1L' },
      { name: 'Loyalty club stamp', quantity: null },
    ],
    budget: BUDGET,
  }
}

const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], 'shelf.jpg', { type: 'image/jpeg' })

async function pickPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(await screen.findByLabelText(/photo of/i), photo())
}

describe('FoodScanPage', () => {
  it('asks which job first, and starts it on the capture step', async () => {
    const user = userEvent.setup()
    const router = renderRoute('/scan')

    // Two named jobs, not two abstract modes — and no capture control until
    // one of them has been chosen.
    expect(await screen.findByText('What are we looking at?')).toBeTruthy()
    expect(screen.queryByLabelText(/photo of/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: /what can i cook/i }))

    // The choice is a real destination, so Back returns to the picker.
    await waitFor(() => expect(router.state.location.search).toBe('?mode=pantry'))
    expect(await screen.findByLabelText(/photo of your food/i)).toBeTruthy()
  })

  it('keeps the camera capture attribute on the file input', async () => {
    renderRoute('/scan?mode=pantry')

    const input = (await screen.findByLabelText(/photo of your food/i)) as HTMLInputElement
    // What makes a scan a scan on a phone: the rear camera opens directly.
    // The guided capture zone wraps this input; it never replaces it.
    expect(input.getAttribute('capture')).toBe('environment')
  })

  it('shows detections, marks the unknown one, and links the match', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/scan/pantry', () => HttpResponse.json(pantryResponse())))

    renderRoute('/scan?mode=pantry')
    await pickPhoto(user)

    expect(await screen.findByText('flour')).toBeTruthy()
    // The unresolved detection is surfaced by name, not dropped.
    expect(screen.getByText(/don.t know .*haskap berries/i)).toBeTruthy()

    // The match card carries the checkable coverage numbers and the gap.
    expect(screen.getByText(/you have 2 of 3 ingredients/i)).toBeTruthy()
    expect(screen.getByText(/missing: caster sugar/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /shortbread/i }).getAttribute('href')).toBe(
      `/recipes/${RECIPE_ID}`,
    )
  })

  it('renders an honest empty state when no food was seen', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/scan/pantry', () =>
        HttpResponse.json(pantryResponse({ detected: [], matches: [] })),
      ),
    )

    renderRoute('/scan?mode=pantry')
    await pickPhoto(user)

    expect(await screen.findByText(/couldn.t see any food/i)).toBeTruthy()
    expect(screen.getByText(/nothing was guessed at/i)).toBeTruthy()
  })

  it('confirms a receipt draft through the manual-add endpoint, minus swiped-away rows', async () => {
    const user = userEvent.setup()
    const added: unknown[] = []
    server.use(
      http.post('/api/scan/receipt', () => HttpResponse.json(receiptResponse())),
      http.post('/api/shopping-list', async ({ request }) => {
        added.push(await request.json())
        return HttpResponse.json(
          { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', ingredient: 'x', quantity: '1', isPurchased: false, createdAt: '2026-08-07T00:00:00Z', mealPlanId: null },
          { status: 201 },
        )
      }),
    )

    const router = renderRoute('/scan?mode=receipt')
    await pickPhoto(user)

    // The draft is on screen and nothing has been posted yet.
    expect(await screen.findByText('Whole milk')).toBeTruthy()
    expect(added).toHaveLength(0)

    // Swipe the noise away, confirm the rest. The gesture's keyboard/AT twin is
    // the Remove button the swipe uncovers — same handler, same result.
    await user.click(screen.getByRole('button', { name: /remove loyalty club stamp/i }))
    await user.click(screen.getByRole('button', { name: /add 1 to this week/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/shopping-list'))
    expect(added).toHaveLength(1)
    const row = added[0] as { ingredient: string; quantity: string; weekStartDate: string }
    expect(row.ingredient).toBe('Whole milk')
    expect(row.quantity).toBe('2 x 1L')
    // The backend 400s anything that is not a UTC-midnight Monday.
    const week = new Date(row.weekStartDate)
    expect(week.getUTCDay()).toBe(1)
    expect(row.weekStartDate.endsWith('T00:00:00.000Z')).toBe(true)
  })

  it('brings a removed line back with undo', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/scan/receipt', () => HttpResponse.json(receiptResponse())))

    renderRoute('/scan?mode=receipt')
    await pickPhoto(user)
    expect(await screen.findByText('Loyalty club stamp')).toBeTruthy()

    // Removing is destructive, so it is never final until Confirm: the line
    // leaves the list, the count drops, and Undo puts both back.
    await user.click(screen.getByRole('button', { name: /remove loyalty club stamp/i }))
    expect(screen.queryByText('Loyalty club stamp')).toBeNull()
    expect(screen.getByRole('button', { name: /add 1 to this week/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Loyalty club stamp')).toBeTruthy()
    expect(screen.getByRole('button', { name: /add 2 to this week/i })).toBeTruthy()
  })

  it('keeps the server’s sentence when a scan fails', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/scan/pantry', () =>
        HttpResponse.json(
          { title: 'The scanner is temporarily unavailable.', detail: 'The photo could not be read just now. Nothing was saved — please try again.' },
          { status: 502 },
        ),
      ),
    )

    renderRoute('/scan?mode=pantry')
    await pickPhoto(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be read just now/i)
  })

  it('explains an exhausted AI budget', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/scan/pantry', () =>
        HttpResponse.json({ title: 'Daily AI budget exhausted.' }, { status: 429 }),
      ),
    )

    renderRoute('/scan?mode=pantry')
    await pickPhoto(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(/today's AI allowance/i)
  })
})
