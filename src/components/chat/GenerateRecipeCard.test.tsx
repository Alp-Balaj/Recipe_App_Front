import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import GenerateRecipeCard from './GenerateRecipeCard'
import { server } from '@/test/msw/server'

// ─────────────────────────────────────────────────────────────────────────
// The AI recipe generator on the chat surface (stream E, decision D1). MSW
// throughout, like PlanWeekAssistant.test.tsx: what matters is the REQUEST the
// card makes (the prompt, and the conversation that gives the result its
// provenance) and how each of the two AI failure modes reads back to the user.
//
// The outcome is deliberately a LINK to an ordinary /recipes/{id}, not a
// preview — per D1 the recipe is a real user-owned row the moment it is
// written — so "the link points at the new recipe" is the assertion that the
// whole no-second-write-path argument rests on.
// ─────────────────────────────────────────────────────────────────────────

const CONVERSATION_ID = 'c0000000-0000-0000-0000-000000000001'
const RECIPE_ID = 'ffffffff-0000-0000-0000-000000000009'

const generated = {
  recipe: {
    id: RECIPE_ID,
    title: 'Charred Broccoli Noodles',
    description: 'A fast bowl.',
    prepTimeMinutes: 5,
    cookTimeMinutes: 15,
    totalTimeMinutes: 20,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: 'Thai',
    caloriesPerServing: 480,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: null,
    ingredients: [{ name: 'broccoli', quantity: 1, unit: 'Piece' }],
    steps: [{ stepNumber: 1, description: 'Char it.', timerSeconds: null }],
    tags: ['Quick'],
    createdByUserId: '11111111-1111-1111-1111-111111111111',
    isAiGenerated: true,
    sourceConversationId: CONVERSATION_ID,
  },
  budget: {
    dailyCallLimit: 20,
    callsUsed: 19,
    callsRemaining: 1,
    dailyTokenLimit: 100000,
    tokensUsed: 4000,
    tokensRemaining: 96000,
    resetsAtUtc: '2026-08-01T00:00:00.000Z',
  },
  // The common case: a caller with no restrictions gets no verdicts (stream H).
  dietaryChecks: [],
}

/** Serves POST /recipes/generate and records every request body. */
function generateEndpoint(status = 201) {
  const bodies: Array<Record<string, unknown>> = []
  server.use(
    http.post('/api/recipes/generate', async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>)
      if (status !== 201) {
        return HttpResponse.json({ title: 'nope' }, { status })
      }
      return HttpResponse.json(generated, { status: 201 })
    }),
  )
  return bodies
}

function renderCard(conversationId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GenerateRecipeCard conversationId={conversationId} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function generate(prompt = 'a 20-minute noodle bowl') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Describe the recipe to generate'), prompt)
  await user.click(screen.getByRole('button', { name: 'Generate' }))
}

describe('GenerateRecipeCard', () => {
  it('sends the prompt with the active conversation and links to the saved recipe', async () => {
    const bodies = generateEndpoint()

    renderCard(CONVERSATION_ID)
    await generate()

    await waitFor(() => expect(bodies).toHaveLength(1))
    // The conversation id is what records provenance (D1) AND what gives the
    // generator the thread's recent messages as context.
    expect(bodies[0]).toEqual({ prompt: 'a 20-minute noodle bowl', conversationId: CONVERSATION_ID })

    expect(await screen.findByText(/Charred Broccoli Noodles/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', `/recipes/${RECIPE_ID}`)
    // Stream B's budget rides on the response so the surface can say what is left
    // without a second request.
    expect(screen.getByText('1 AI call left today')).toBeInTheDocument()
  })

  it('generates without a conversation when the thread has not started yet', async () => {
    const bodies = generateEndpoint()

    renderCard(undefined)
    await generate()

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].conversationId).toBeUndefined()
  })

  it('trims the prompt and clears the field after a successful write', async () => {
    const bodies = generateEndpoint()

    renderCard(CONVERSATION_ID)
    await generate('  padded prompt  ')

    await waitFor(() => expect(bodies[0].prompt).toBe('padded prompt'))
    await waitFor(() =>
      expect(screen.getByLabelText('Describe the recipe to generate')).toHaveValue(''),
    )
  })

  it('tells the user the budget is spent on a 429, not that the generator broke', async () => {
    // The two AI failure modes need different copy: one is worth retrying now,
    // the other is not.
    generateEndpoint(429)

    renderCard(CONVERSATION_ID)
    await generate()

    expect(await screen.findByText(/used today's AI allowance/)).toBeInTheDocument()
  })

  it('reports a generator failure as nothing-was-saved', async () => {
    generateEndpoint(502)

    renderCard(CONVERSATION_ID)
    await generate()

    expect(await screen.findByText(/couldn't write a usable recipe/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open it' })).not.toBeInTheDocument()
  })

  // ── dietary verification at the AI boundary (stream H) ────────────────────

  it('reports a dietary conflict in the generated recipe, and still links to it', async () => {
    // The generator INVENTS its ingredients and the row is saved before anyone
    // looks (D1), so the finding is information, not a failed write.
    server.use(
      http.post('/api/recipes/generate', () =>
        HttpResponse.json(
          {
            ...generated,
            dietaryChecks: [
              {
                restriction: 'Vegan',
                conflicts: [{ ingredientName: 'Cheddar cheese', reason: 'contains cheese' }],
                uncheckableLines: 0,
              },
            ],
          },
          { status: 201 },
        ),
      ),
    )

    renderCard(CONVERSATION_ID)
    await generate()

    expect(await screen.findByText(/Conflicts with Vegan/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it' })).toBeInTheDocument()
  })

  it('never claims the recipe is safe when it could not read every line', async () => {
    // The one that matters. A clean result over unreadable lines must not render
    // as a pass — D8 guarantees unresolved ingredients will always exist.
    server.use(
      http.post('/api/recipes/generate', () =>
        HttpResponse.json(
          {
            ...generated,
            dietaryChecks: [{ restriction: 'Vegan', conflicts: [], uncheckableLines: 2 }],
          },
          { status: 201 },
        ),
      ),
    )

    renderCard(CONVERSATION_ID)
    await generate()

    expect(await screen.findByText(/2 ingredients could not be checked/)).toBeInTheDocument()
    expect(screen.getByText(/No conflicts found/)).toBeInTheDocument()
    expect(screen.queryByText(/safe/i)).not.toBeInTheDocument()
  })

  it('shows no badge at all when nothing was found and nothing was unreadable', async () => {
    // Silence is the quiet case; a reassuring tick here would train the eye to
    // skim past the badge that matters.
    generateEndpoint()

    renderCard(CONVERSATION_ID)
    await generate()

    expect(await screen.findByRole('link', { name: 'Open it' })).toBeInTheDocument()
    expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Conflicts with/)).not.toBeInTheDocument()
  })

  it('survives a response from a backend that does not send the field yet', async () => {
    // The repos deploy independently. A frontend ahead of its backend must
    // degrade to no badge, not take the whole result card down.
    server.use(
      http.post('/api/recipes/generate', () => {
        const { dietaryChecks: _omitted, ...withoutChecks } = generated
        return HttpResponse.json(withoutChecks, { status: 201 })
      }),
    )

    renderCard(CONVERSATION_ID)
    await generate()

    expect(await screen.findByRole('link', { name: 'Open it' })).toBeInTheDocument()
  })

  it('cannot be submitted with a blank prompt', async () => {
    const bodies = generateEndpoint()
    const user = userEvent.setup()

    renderCard(CONVERSATION_ID)
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()

    await user.type(screen.getByLabelText('Describe the recipe to generate'), '   ')
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
    expect(bodies).toHaveLength(0)
  })
})
