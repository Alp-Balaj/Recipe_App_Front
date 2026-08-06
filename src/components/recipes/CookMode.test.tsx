import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import CookMode from './CookMode'
import type { RecipeResponse } from '@/api/types'

// Stream M. The five things cook mode promises, each tested as a promise rather
// than as a render: the timer really counts the clock, the wake lock is only
// claimed when held, scaling is arithmetic that never touches prose, the
// assistant's boundary is visible, and "Finished cooking" reaches the existing
// cook-and-rate action — and survives a failure of it (decision D18).

const RECIPE_ID = 'cook-r1'

function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: RECIPE_ID,
    title: 'Tomato Soup',
    description: 'A warming bowl.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 25,
    totalTimeMinutes: 35,
    servings: 4,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: null,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: null,
    ingredients: [
      { name: 'tomatoes', quantity: 800, unit: 'Gram' },
      { name: 'butter', quantity: 2, unit: 'Tablespoon' },
      { name: 'black pepper', quantity: 1, unit: 'ToTaste' },
    ],
    steps: [
      {
        stepNumber: 1,
        description: 'Melt the butter in a heavy pan.',
        durationSeconds: 120,
        ingredientIndexes: [1],
      },
      {
        stepNumber: 2,
        description: 'Add the tomatoes and roast for 25 minutes.',
        durationSeconds: 1500,
        ingredientIndexes: [0],
        temperature: { value: 180, unit: 'Celsius' },
      },
      {
        stepNumber: 3,
        description: 'Season to taste and serve.',
        ingredientIndexes: [2],
      },
    ],
    tags: [],
    createdByUserId: 'author-1',
    ...over,
  }
}

function renderCookMode(
  over: {
    recipe?: RecipeResponse
    myRating?: number | null
    onRate?: (v: number | null) => void
    requireAuth?: () => boolean
    onExit?: () => void
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const props = {
    recipe: over.recipe ?? makeRecipe(),
    myRating: over.myRating ?? null,
    onRate: over.onRate ?? (() => {}),
    requireAuth: over.requireAuth ?? (() => true),
    onExit: over.onExit ?? (() => {}),
  }
  return render(
    <QueryClientProvider client={client}>
      <CookMode {...props} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

// ── Steps ─────────────────────────────────────────────────────────────────

describe('CookMode — the method', () => {
  it('opens on step one with the lines that step uses', async () => {
    renderCookMode()

    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('Melt the butter in a heavy pan.')).toBeInTheDocument()
    expect(screen.getByText('2 tbsp')).toBeInTheDocument()
    expect(screen.getByText('butter')).toBeInTheDocument()
  })

  it('walks forward and back, and offers the finish action only on the last step', async () => {
    renderCookMode()

    expect(screen.queryByText('Finished cooking')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Next →'))
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Next →'))
    expect(screen.getByText('Finished cooking')).toBeInTheDocument()

    await userEvent.click(screen.getByText('← Prev'))
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
  })

  it('does not claim to hold a wake lock on a browser without the API', () => {
    // jsdom has no navigator.wakeLock. A badge that promised to keep the screen
    // awake anyway would be worse than saying nothing — the promise is the
    // thing people rely on.
    renderCookMode()
    expect(screen.queryByText(/SCREEN ON/)).not.toBeInTheDocument()
  })
})

// ── D17: scaling ──────────────────────────────────────────────────────────

describe('CookMode — serving scaling (D17)', () => {
  it('scales the quantities and leaves the prose exactly as written', async () => {
    renderCookMode()

    await userEvent.click(screen.getByLabelText('One more serving'))
    await userEvent.click(screen.getByLabelText('One more serving'))
    await userEvent.click(screen.getByLabelText('One more serving'))
    await userEvent.click(screen.getByLabelText('One more serving'))

    // 4 → 8 servings: the butter doubles…
    expect(screen.getByText('4 tbsp')).toBeInTheDocument()
    // …and the author's sentence is untouched, including a number inside it.
    await userEvent.click(screen.getByText('Next →'))
    expect(screen.getByText('Add the tomatoes and roast for 25 minutes.')).toBeInTheDocument()
    expect(screen.getByText('1600 g')).toBeInTheDocument()
  })

  it('says which number wins when the prose and the list can disagree', async () => {
    renderCookMode()
    await userEvent.click(screen.getByLabelText('One more serving'))

    expect(screen.getByText(/the amounts above are the ones to follow/)).toBeInTheDocument()
    expect(screen.getByText(/Times and temperatures are unchanged/)).toBeInTheDocument()
  })

  it('never scales a temperature', async () => {
    renderCookMode()
    await userEvent.click(screen.getByLabelText('One more serving'))
    await userEvent.click(screen.getByText('Next →'))

    // An oven does not get hotter for more people.
    expect(screen.getByText('◈ 180 °C')).toBeInTheDocument()
  })

  it('leaves a to-taste line reading "to taste" at any scale', async () => {
    renderCookMode()
    await userEvent.click(screen.getByLabelText('One more serving'))
    await userEvent.click(screen.getByText('Next →'))
    await userEvent.click(screen.getByText('Next →'))

    expect(screen.getByText('to taste')).toBeInTheDocument()
  })

  it('shows no banner and no factor at the recipe\'s own serving count', () => {
    renderCookMode()
    expect(screen.queryByText(/the amounts above are the ones to follow/)).not.toBeInTheDocument()
  })
})

// ── Timers ────────────────────────────────────────────────────────────────

// These three drive the UI with fireEvent rather than userEvent, deliberately.
// userEvent schedules its own timers between pointer events, and pairing that
// with vi.useFakeTimers() means the test spends its time arbitrating between two
// timer systems instead of testing the one under test. fireEvent is synchronous
// and owns no clock, which leaves vi.advanceTimersByTimeAsync as the ONLY thing
// moving time — which is the whole point of these cases.
describe('CookMode — timers', () => {
  const click = (el: HTMLElement) => act(() => void fireEvent.click(el))

  it('counts the clock down, not the ticks it was given', async () => {
    vi.useFakeTimers()
    renderCookMode()

    // Step one is 120 s.
    expect(screen.getByText('2:00')).toBeInTheDocument()
    click(screen.getByText('▷ Start'))

    await act(() => vi.advanceTimersByTimeAsync(30_000))
    expect(screen.getByText('1:30')).toBeInTheDocument()

    // The interval only re-renders; the number is a subtraction against
    // Date.now(). Advancing the clock far past the duration must land on zero
    // rather than on "however many ticks we happened to receive".
    await act(() => vi.advanceTimersByTimeAsync(300_000))
    expect(screen.getByText('0:00')).toBeInTheDocument()
    expect(screen.getByText('✓ Done')).toBeInTheDocument()
  })

  it('pauses and resumes', async () => {
    vi.useFakeTimers()
    renderCookMode()

    click(screen.getByText('▷ Start'))
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    click(screen.getByText('⏸ Pause'))

    await act(() => vi.advanceTimersByTimeAsync(60_000))
    // Paused means paused: the wall clock moved and the timer did not.
    expect(screen.getByText('1:40')).toBeInTheDocument()

    click(screen.getByText('▷ Resume'))
    await act(() => vi.advanceTimersByTimeAsync(40_000))
    expect(screen.getByText('1:00')).toBeInTheDocument()
  })

  it('keeps a timer running after you walk on to the next step', async () => {
    // You start the rice and move to the sauce. A timer that stopped when you
    // pressed Next would be a timer for a way of cooking nobody uses.
    vi.useFakeTimers()
    renderCookMode()

    click(screen.getByText('▷ Start'))
    await act(() => vi.advanceTimersByTimeAsync(20_000))
    click(screen.getByText('Next →'))

    // It reappears on the rail, labelled with the step it belongs to, one tap
    // from getting back to it.
    const rail = screen.getByRole('button', { name: /Step 1/ })
    expect(within(rail).getByText('1:40')).toBeInTheDocument()

    click(rail)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })
})

// ── The assistant ─────────────────────────────────────────────────────────

describe('CookMode — the bounded assistant', () => {
  it('sends the question with the cook\'s serving count and renders the answer', async () => {
    let body: unknown
    server.use(
      http.post('*/recipes/:id/cook/ask', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          answer: 'Yes — the same volume of a neutral oil works.',
          refused: false,
          budget: {
            dailyCallLimit: 50,
            callsUsed: 1,
            callsRemaining: 49,
            dailyTokenLimit: 1,
            tokensUsed: 0,
            tokensRemaining: 1,
            resetsAtUtc: '2026-08-07T00:00:00Z',
          },
        })
      }),
    )

    renderCookMode()
    await userEvent.click(screen.getByLabelText('One more serving'))
    await userEvent.click(screen.getByText('✻ Ask about this recipe'))
    await userEvent.type(screen.getByLabelText('Ask about this recipe'), 'can I use oil?')
    await userEvent.click(screen.getByText('Ask'))

    expect(await screen.findByText('Yes — the same volume of a neutral oil works.')).toBeInTheDocument()
    // The prompt's quantities have to match the screen's, so the target
    // serving count travels with the question.
    expect(body).toMatchObject({ question: 'can I use oil?', servings: 5, history: [] })
    expect(screen.getByText(/49 left today/)).toBeInTheDocument()
  })

  it('sends the prior turns back, because nothing is stored server-side (D14)', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('*/recipes/:id/cook/ask', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          answer: `answer ${bodies.length}`,
          refused: false,
          budget: {
            dailyCallLimit: 50,
            callsUsed: bodies.length,
            callsRemaining: 50 - bodies.length,
            dailyTokenLimit: 1,
            tokensUsed: 0,
            tokensRemaining: 1,
            resetsAtUtc: '2026-08-07T00:00:00Z',
          },
        })
      }),
    )

    renderCookMode()
    await userEvent.click(screen.getByText('✻ Ask about this recipe'))
    const box = screen.getByLabelText('Ask about this recipe')

    await userEvent.type(box, 'first?')
    await userEvent.click(screen.getByText('Ask'))
    expect(await screen.findByText('answer 1')).toBeInTheDocument()

    await userEvent.type(box, 'second?')
    await userEvent.click(screen.getByText('Ask'))
    expect(await screen.findByText('answer 2')).toBeInTheDocument()

    expect(bodies[1]).toMatchObject({
      question: 'second?',
      history: [
        { role: 'user', content: 'first?' },
        { role: 'assistant', content: 'answer 1' },
      ],
    })
  })

  it('draws a refusal as a refusal rather than as an answer', async () => {
    server.use(
      http.post('*/recipes/:id/cook/ask', () =>
        HttpResponse.json({
          answer: "I can only help with this recipe while you're cooking it.",
          refused: true,
          budget: {
            dailyCallLimit: 50,
            callsUsed: 1,
            callsRemaining: 49,
            dailyTokenLimit: 1,
            tokensUsed: 0,
            tokensRemaining: 1,
            resetsAtUtc: '2026-08-07T00:00:00Z',
          },
        }),
      ),
    )

    renderCookMode()
    await userEvent.click(screen.getByText('✻ Ask about this recipe'))
    await userEvent.type(screen.getByLabelText('Ask about this recipe'), 'who won the world cup?')
    await userEvent.click(screen.getByText('Ask'))

    const bubble = await screen.findByText("I can only help with this recipe while you're cooking it.")
    // The `refused` flag off the wire drives the styling — the boundary of a
    // bounded assistant has to be legible, not inferred from the prose.
    expect(bubble).toHaveStyle({ fontStyle: 'italic' })
  })

  it('D18: a failed turn keeps the question and does not end the session', async () => {
    server.use(http.post('*/recipes/:id/cook/ask', () => HttpResponse.error()))

    renderCookMode()
    await userEvent.click(screen.getByText('✻ Ask about this recipe'))
    await userEvent.type(screen.getByLabelText('Ask about this recipe'), 'can I use oil?')
    await userEvent.click(screen.getByText('Ask'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/timers and the recipe are unaffected/)
    // The question comes back to the box rather than sitting in the transcript
    // as something that was never asked.
    expect(screen.getByLabelText('Ask about this recipe')).toHaveValue('can I use oil?')
    // And cook mode is still cook mode.
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })

  it('says "out of budget" rather than "try again" on a 429', async () => {
    server.use(
      http.post('*/recipes/:id/cook/ask', () => new HttpResponse(null, { status: 429 })),
    )

    renderCookMode()
    await userEvent.click(screen.getByText('✻ Ask about this recipe'))
    await userEvent.type(screen.getByLabelText('Ask about this recipe'), 'can I use oil?')
    await userEvent.click(screen.getByText('Ask'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/today's AI allowance/)
  })

  it('does not spend a guest\'s nonexistent allowance', async () => {
    const requireAuth = vi.fn(() => false)
    let called = false
    server.use(
      http.post('*/recipes/:id/cook/ask', () => {
        called = true
        return HttpResponse.json({})
      }),
    )

    renderCookMode({ requireAuth })
    await userEvent.click(screen.getByText('✻ Ask about this recipe'))
    await userEvent.type(screen.getByLabelText('Ask about this recipe'), 'can I use oil?')
    await userEvent.click(screen.getByText('Ask'))

    expect(requireAuth).toHaveBeenCalled()
    expect(called).toBe(false)
  })
})

// ── Finishing ─────────────────────────────────────────────────────────────

describe('CookMode — finishing', () => {
  const cooked = { recipeId: RECIPE_ID, timesCooked: 1, rating: null, lastCookedAt: null }

  async function walkToFinish() {
    await userEvent.click(screen.getByText('Next →'))
    await userEvent.click(screen.getByText('Next →'))
    await userEvent.click(screen.getByText('Finished cooking'))
  }

  it('closes into the existing cook-and-rate action', async () => {
    let posted = false
    server.use(
      http.post('*/recipes/:id/cooked', () => {
        posted = true
        return HttpResponse.json(cooked)
      }),
    )

    const onRate = vi.fn()
    renderCookMode({ onRate })
    await walkToFinish()

    expect(await screen.findByText('Logged. How did it go?')).toBeInTheDocument()
    expect(posted).toBe(true)

    await userEvent.click(screen.getByLabelText('Rate 4 out of 5'))
    // The page's own rate mutation, not a second opinion invented here.
    expect(onRate).toHaveBeenCalledWith(4)
  })

  it('D18: a failed log holds the panel open with a retry', async () => {
    let attempts = 0
    server.use(
      http.post('*/recipes/:id/cooked', () => {
        attempts += 1
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json(cooked)
      }),
    )

    renderCookMode()
    await walkToFinish()

    // Losing a cook somebody just logged, silently, because a radio was off is
    // the one failure this surface must not have.
    expect(await screen.findByText(/Couldn't log it just now/)).toBeInTheDocument()
    await userEvent.click(screen.getByText('Try again'))
    await waitFor(() => expect(screen.getByText('Logged. How did it go?')).toBeInTheDocument())
  })

  it('reflects the write under StrictMode, not just under a single mount', async () => {
    // REGRESSION, and the browser pass is what found it. The finish write used
    // to be fired from the panel's mount effect. StrictMode double-invokes those
    // — request out under the first observer, observer torn down, remount gets a
    // fresh one that never hears the result — so the cook landed on the server
    // while the UI sat on "How did it go?" forever. Every dev browser runs
    // StrictMode; no test that mounts once can see it.
    server.use(http.post('*/recipes/:id/cooked', () => HttpResponse.json(cooked)))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <CookMode
            recipe={makeRecipe()}
            myRating={null}
            onRate={() => {}}
            requireAuth={() => true}
            onExit={() => {}}
          />
        </QueryClientProvider>
      </StrictMode>,
    )

    await walkToFinish()
    expect(await screen.findByText('Logged. How did it go?')).toBeInTheDocument()
  })

  it('can go back to the steps from the finish panel', async () => {
    server.use(http.post('*/recipes/:id/cooked', () => HttpResponse.json(cooked)))

    renderCookMode()
    await walkToFinish()
    await userEvent.click(await screen.findByText('← Back to steps'))

    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument()
  })

  it('exits through Done', async () => {
    server.use(http.post('*/recipes/:id/cooked', () => HttpResponse.json(cooked)))
    const onExit = vi.fn()

    renderCookMode({ onExit })
    await walkToFinish()
    await userEvent.click(await screen.findByText('Done'))

    expect(onExit).toHaveBeenCalled()
  })
})
