import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, RouterProvider, createMemoryRouter, useParams } from 'react-router-dom'
import ChatPage from './ChatPage'
import { createMockChatApi, mockConversationId } from '@/api/chat.mock'
import { ChatApiProvider } from '@/components/chat/ChatApiContext'
import type { ThemeContextValue } from '@/components/ThemeRoot'
import { server } from '@/test/msw/server'

// ─────────────────────────────────────────────────────────────────────────
// The Create tab — the AI recipe generator, now a MODE of the chat surface
// rather than a card at the foot of the thread (stream E, decision D1).
//
// These cases were GenerateRecipeCard.test.tsx and are carried over whole:
// what matters is still the REQUEST the surface makes (the prompt, and the
// conversation that gives the result its provenance) and how each of the two
// AI failure modes reads back to the user. They now run against the real page,
// through the real composer, which is a stronger claim than the card ever made
// — it proves the shared composer routes to the right engine.
//
// The outcome is deliberately a LINK to an ordinary /recipes/{id}, not a
// preview — per D1 the recipe is a real user-owned row the moment it is
// written — so "the link points at the new recipe" is the assertion that the
// whole no-second-write-path argument rests on.
// ─────────────────────────────────────────────────────────────────────────

const CONVERSATION_ID = mockConversationId(1)
const RECIPE_ID = 'ffffffff-0000-0000-0000-000000000009'

const theme: ThemeContextValue = { mode: 'dark', setMode: () => {}, toggleMode: () => {} }

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
    steps: [{ stepNumber: 1, description: 'Char it.', durationSeconds: null }],
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
      if (status !== 201) return HttpResponse.json({ title: 'nope' }, { status })
      return HttpResponse.json(generated, { status: 201 })
    }),
  )
  return bodies
}

function RecipeSink() {
  const { id } = useParams()
  return <div data-testid="recipe-detail">Recipe {id}</div>
}

/** Mounts the real ChatPage, so the composer under test is the shipping one. */
function renderChat(initialPath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={theme} />,
        children: [
          { path: '/chat', element: <ChatPage /> },
          { path: '/chat/:conversationId', element: <ChatPage /> },
          { path: '/recipes/new', element: <div data-testid="new-recipe-form" /> },
          { path: '/recipes/:id', element: <RecipeSink /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  render(
    <QueryClientProvider client={client}>
      <ChatApiProvider value={createMockChatApi({ latencyMs: 0, seedCount: 1 })}>
        <RouterProvider router={router} />
      </ChatApiProvider>
    </QueryClientProvider>,
  )
  return router
}

async function generate(prompt = 'a 20-minute noodle bowl') {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Describe the recipe to generate'), prompt)
  await user.click(screen.getByRole('button', { name: 'Generate recipe' }))
}

describe('Chat — Create mode', () => {
  it('sends the prompt with the active conversation and links to the saved recipe', async () => {
    const bodies = generateEndpoint()

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    await waitFor(() => expect(bodies).toHaveLength(1))
    // The conversation id is what records provenance (D1) AND what gives the
    // generator the thread's recent messages as context.
    expect(bodies[0]).toEqual({ prompt: 'a 20-minute noodle bowl', conversationId: CONVERSATION_ID })

    expect(await screen.findByText(/Charred Broccoli Noodles/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open recipe' })).toHaveAttribute('href', `/recipes/${RECIPE_ID}`)
    // Stream B's budget rides on the response so the surface can say what is left
    // without a second request.
    expect(screen.getByText('1 AI call left today')).toBeInTheDocument()
  })

  it('generates without a conversation when the thread has not started yet', async () => {
    const bodies = generateEndpoint()

    renderChat('/chat?mode=create')
    await generate()

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0].conversationId).toBeUndefined()
  })

  it('trims the prompt and clears the composer after a successful write', async () => {
    const bodies = generateEndpoint()

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate('  padded prompt  ')

    await waitFor(() => expect(bodies[0].prompt).toBe('padded prompt'))
    expect(screen.getByLabelText('Describe the recipe to generate')).toHaveValue('')
  })

  it('tells the user the budget is spent on a 429, not that the generator broke', async () => {
    // The two AI failure modes need different copy: one is worth retrying now,
    // the other is not.
    generateEndpoint(429)

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByText(/Out of AI calls today/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument()
  })

  it('offers the free way out when the budget is spent', async () => {
    // A spent budget is a "later", not a dead end: the library costs nothing and
    // the manual form is the "+" the bottom nav no longer shows on this page.
    generateEndpoint(429)
    const user = userEvent.setup()

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByRole('link', { name: /Write one myself/ })).toHaveAttribute(
      'href',
      '/recipes/new',
    )
    await user.click(screen.getByRole('button', { name: /Search my library instead/ }))
    expect(await screen.findByLabelText('Message the assistant')).toBeInTheDocument()
  })

  it('reports a generator failure as nothing-was-saved', async () => {
    generateEndpoint(502)

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByText(/couldn't write a usable recipe/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open recipe' })).not.toBeInTheDocument()
  })

  it('cannot be submitted with a blank prompt', async () => {
    const bodies = generateEndpoint()
    const user = userEvent.setup()

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    expect(screen.getByRole('button', { name: 'Generate recipe' })).toBeDisabled()

    await user.type(screen.getByLabelText('Describe the recipe to generate'), '   ')
    expect(screen.getByRole('button', { name: 'Generate recipe' })).toBeDisabled()
    expect(bodies).toHaveLength(0)
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

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByText(/Conflicts with Vegan/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open recipe' })).toBeInTheDocument()
  })

  it('never claims the recipe is safe when it could not read every line', async () => {
    // The one that matters. A clean result over unreadable lines must not render
    // as a pass — D8 guarantees unresolved ingredients will always exist.
    server.use(
      http.post('/api/recipes/generate', () =>
        HttpResponse.json(
          { ...generated, dietaryChecks: [{ restriction: 'Vegan', conflicts: [], uncheckableLines: 2 }] },
          { status: 201 },
        ),
      ),
    )

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByText(/2 ingredients could not be checked/)).toBeInTheDocument()
    expect(screen.getByText(/No conflicts found/)).toBeInTheDocument()
    expect(screen.queryByText(/safe/i)).not.toBeInTheDocument()
  })

  it('shows no badge at all when nothing was found and nothing was unreadable', async () => {
    // Silence is the quiet case; a reassuring tick here would train the eye to
    // skim past the badge that matters.
    generateEndpoint()

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByRole('link', { name: 'Open recipe' })).toBeInTheDocument()
    expect(screen.queryByText(/No conflicts found/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Conflicts with/)).not.toBeInTheDocument()
  })

  it('survives a response from a backend that does not send the field yet', async () => {
    // The repos deploy independently. A frontend ahead of its backend must
    // degrade to no badge, not take the whole result down with it.
    server.use(
      http.post('/api/recipes/generate', () => {
        const { dietaryChecks: _omitted, ...withoutChecks } = generated
        return HttpResponse.json(withoutChecks, { status: 201 })
      }),
    )

    renderChat(`/chat/${CONVERSATION_ID}?mode=create`)
    await generate()

    expect(await screen.findByRole('link', { name: 'Open recipe' })).toBeInTheDocument()
  })
})
