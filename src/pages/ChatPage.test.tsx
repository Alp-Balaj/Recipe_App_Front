import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, RouterProvider, createMemoryRouter, useParams } from 'react-router-dom'
import ChatPage from './ChatPage'
import { createMockChatApi, mockConversationId, FALLBACK_RECIPES } from '@/api/chat.mock'
import type { ChatApi } from '@/api/chat'
import { ChatApiProvider } from '@/components/chat/ChatApiContext'
import type { ThemeContextValue } from '@/components/ThemeRoot'

const theme: ThemeContextValue = { mode: 'dark', setMode: () => {}, toggleMode: () => {} }

/**
 * Mount ChatPage in a minimal router that supplies the outlet theme context and
 * a /recipes/:id sink, with an injected ChatApi. Both /chat and
 * /chat/:conversationId point at ChatPage (mirroring the real router). Each case
 * gets a fresh mock so no conversation state leaks across tests.
 */
function renderChat(api: ChatApi, initialPath = '/chat') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={theme} />,
        children: [
          { path: '/chat', element: <ChatPage /> },
          { path: '/chat/:conversationId', element: <ChatPage /> },
          { path: '/recipes/:id', element: <RecipeSink /> },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  )
  render(
    <QueryClientProvider client={client}>
      <ChatApiProvider value={api}>
        <RouterProvider router={router} />
      </ChatApiProvider>
    </QueryClientProvider>,
  )
  return router
}

function RecipeSink() {
  const { id } = useParams()
  return <div data-testid="recipe-detail">Recipe {id}</div>
}

const CONV_1 = mockConversationId(1)

describe('ChatPage — a single conversation', () => {
  it('renders the seeded thread (assistant greeting) from getMessages', async () => {
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 3 }), `/chat/${CONV_1}`)
    expect(await screen.findByText(/Tell me what you're craving/i)).toBeInTheDocument()
  })

  it('sending a message appends the user turn and an assistant reply', async () => {
    const user = userEvent.setup()
    // seedCount 1 → the thread is just the greeting (no seeded replies/suggestions
    // to collide with the assertions below).
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.type(screen.getByLabelText('Message the assistant'), 'Something warm and vegan')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() =>
      expect(screen.getByText(/here are|should hit the spot|match|fit the bill/i)).toBeInTheDocument(),
    )
    expect(screen.getByText('Something warm and vegan')).toBeInTheDocument()
  })

  it('renders suggestion cards inside assistant messages and links to /recipes/:id', async () => {
    const user = userEvent.setup()
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.type(screen.getByLabelText('Message the assistant'), 'ideas please')
    await user.click(screen.getByLabelText('Send message'))

    const card = await screen.findByRole('link', { name: FALLBACK_RECIPES[0].title })
    await user.click(card)
    const detail = await screen.findByTestId('recipe-detail')
    expect(within(detail).getByText(new RegExp(FALLBACK_RECIPES[0].id))).toBeInTheDocument()
  })

  it('pages older messages via the scroll-back control', async () => {
    const user = userEvent.setup()
    // 24+ seeded messages > one page of 20 → a second (older) page exists.
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 24 }), `/chat/${CONV_1}`)

    const loadMore = await screen.findByRole('button', { name: /load earlier messages/i })
    expect(screen.queryByText(/Tell me what you're craving/i)).not.toBeInTheDocument()

    await user.click(loadMore)
    expect(await screen.findByText(/Tell me what you're craving/i)).toBeInTheDocument()
  })
})

describe('ChatPage — Library and Create modes', () => {
  // The page carries two engines: grounded search over recipes that exist, and
  // a generator that invents one and spends a daily AI call. They used to share
  // a screen with a text field each, so the composer could not say which of
  // them the next Enter would reach. These cases pin the cues that now answer
  // that question before the user commits to anything.

  it('opens in Library, and the composer talks to the assistant', async () => {
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}`)

    expect(await screen.findByRole('tab', { name: /Library/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Create/ })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByLabelText('Message the assistant')).toBeInTheDocument()
  })

  it('switching to Create swaps the surface, the composer and the send action', async () => {
    const user = userEvent.setup()
    const router = renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.click(screen.getByRole('tab', { name: /Create/ }))

    // The mode rides in the query string, not the path — router.tsx is frozen.
    await waitFor(() => expect(router.state.location.search).toBe('?mode=create'))
    expect(router.state.location.pathname).toBe(`/chat/${CONV_1}`)

    // A different engine, said four ways: header, tab, composer label, send action.
    expect(screen.getByText('Create a recipe')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Create/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Describe the recipe to generate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate recipe' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Message the assistant')).not.toBeInTheDocument()

    // And the grounded thread is not left underneath to be mistaken for output.
    expect(screen.queryByText(/Tell me what you're craving/i)).not.toBeInTheDocument()
  })

  it('says which thread it is drawing context from', async () => {
    // generateRecipe sends conversationId, which both records provenance and
    // feeds the generator the thread's recent messages. The user should know.
    const user = userEvent.setup()
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 3 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.click(screen.getByRole('tab', { name: /Create/ }))
    expect(await screen.findByText(/Using context from/)).toHaveTextContent('Weeknight dinners')
  })

  it('the foot-of-thread handoff is the route into Create, and carries no second input', async () => {
    const user = userEvent.setup()
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    const handoff = screen.getByRole('button', { name: /Write me a new one/ })
    await user.click(handoff)

    expect(await screen.findByLabelText('Describe the recipe to generate')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Write me a new one/ })).not.toBeInTheDocument()
  })

  it('returns to Library, dropping the mode from the URL', async () => {
    const user = userEvent.setup()
    const router = renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}?mode=create`)

    await user.click(await screen.findByRole('tab', { name: /Library/ }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(await screen.findByLabelText('Message the assistant')).toBeInTheDocument()
  })

  it('treats an unknown mode as Library rather than the surface that spends', async () => {
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }), `/chat/${CONV_1}?mode=banana`)

    expect(await screen.findByLabelText('Message the assistant')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Library/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('ChatPage — multiple conversations', () => {
  it('a first send on /chat creates a conversation and deep-links to /chat/:id', async () => {
    const user = userEvent.setup()
    // Fresh user, no seeded conversations → the new one gets id #1.
    const router = renderChat(createMockChatApi({ latencyMs: 0, conversationCount: 0 }), '/chat')

    // New-chat surface: the welcome copy, not a loaded thread.
    expect(await screen.findByText(/This starts a new conversation/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Message the assistant'), 'quick weeknight pasta')
    await user.click(screen.getByLabelText('Send message'))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/chat/${mockConversationId(1)}`))
    // The first message both titles the conversation (header) and shows as the
    // user turn (bubble), so it renders at least once — findAll also waits out
    // the post-navigation render.
    expect((await screen.findAllByText('quick weeknight pasta')).length).toBeGreaterThanOrEqual(1)
  })

  it('the drawer lists conversations and switches the active thread', async () => {
    const user = userEvent.setup()
    // Two seeded conversations: 'Weeknight dinners' (#1) and 'Something warm and vegan' (#2).
    const router = renderChat(createMockChatApi({ latencyMs: 0, seedCount: 3 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.click(screen.getByLabelText('Open conversations'))
    const drawer = await screen.findByRole('dialog', { name: 'Conversations' })

    // Switch to the other conversation.
    await user.click(within(drawer).getByRole('button', { name: 'Something warm and vegan' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/chat/${mockConversationId(2)}`))
  })

  it('the drawer renames a conversation', async () => {
    const user = userEvent.setup()
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 3 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.click(screen.getByLabelText('Open conversations'))
    const drawer = await screen.findByRole('dialog', { name: 'Conversations' })

    await user.click(within(drawer).getByRole('button', { name: 'Rename Weeknight dinners' }))
    const input = within(drawer).getByLabelText('Conversation title')
    await user.clear(input)
    await user.type(input, 'Cosy autumn meals{Enter}')

    expect(await within(drawer).findByRole('button', { name: 'Cosy autumn meals' })).toBeInTheDocument()
  })

  it('the drawer deletes a conversation after confirmation', async () => {
    const user = userEvent.setup()
    const router = renderChat(createMockChatApi({ latencyMs: 0, seedCount: 3 }), `/chat/${CONV_1}`)
    await screen.findByText(/Tell me what you're craving/i)

    await user.click(screen.getByLabelText('Open conversations'))
    const drawer = await screen.findByRole('dialog', { name: 'Conversations' })

    await user.click(within(drawer).getByRole('button', { name: 'Delete Weeknight dinners' }))
    await user.click(within(drawer).getByRole('button', { name: 'Confirm delete Weeknight dinners' }))

    // Deleting the active thread falls back to the new-chat surface.
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
    await waitFor(() =>
      expect(within(drawer).queryByRole('button', { name: 'Weeknight dinners' })).not.toBeInTheDocument(),
    )
  })
})
