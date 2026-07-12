import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, RouterProvider, createMemoryRouter, useParams } from 'react-router-dom'
import ChatPage from './ChatPage'
import { createMockChatApi, FALLBACK_RECIPES } from '@/api/chat.mock'
import type { ChatApi } from '@/api/chat'
import { ChatApiProvider } from '@/components/chat/ChatApiContext'
import type { ThemeContextValue } from '@/components/ThemeRoot'

const theme: ThemeContextValue = { mode: 'dark', setMode: () => {}, toggleMode: () => {} }

/**
 * Mount ChatPage in a minimal router that supplies the outlet theme context and
 * a /recipes/:id sink route, with an injected ChatApi. Self-contained so each
 * case gets a fresh mock thread (no cross-test pollution of the app singleton).
 */
function renderChat(api: ChatApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={theme} />,
        children: [
          { path: '/chat', element: <ChatPage /> },
          { path: '/recipes/:id', element: <RecipeSink /> },
        ],
      },
    ],
    { initialEntries: ['/chat'] },
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

describe('ChatPage', () => {
  it('renders the seeded thread (assistant greeting) from getMessages', async () => {
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 3 }))
    expect(await screen.findByText(/Tell me what you're craving/i)).toBeInTheDocument()
  })

  it('sending a message appends the user turn and an assistant reply', async () => {
    const user = userEvent.setup()
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }))

    // Wait for the initial history to settle.
    await screen.findByText(/Tell me what you're craving/i)

    const input = screen.getByLabelText('Message the assistant')
    await user.type(input, 'Something warm and vegan')
    await user.click(screen.getByLabelText('Send message'))

    // Wait for the assistant reply to land — once it renders, the send settled
    // (the optimistic bubble was swapped for the persisted turns in one commit),
    // so both the user turn and the reply are stably in the document. Re-query
    // rather than holding a node reference across the pending→settled swap.
    await waitFor(() =>
      expect(screen.getByText(/here are|should hit the spot|match|fit the bill/i)).toBeInTheDocument(),
    )
    expect(screen.getByText('Something warm and vegan')).toBeInTheDocument()
  })

  it('renders suggestion cards inside assistant messages and links to /recipes/:id', async () => {
    const user = userEvent.setup()
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 1 }))
    await screen.findByText(/Tell me what you're craving/i)

    await user.type(screen.getByLabelText('Message the assistant'), 'ideas please')
    await user.click(screen.getByLabelText('Send message'))

    // Suggestions come from fixtures offline (no GET /recipes handler in tests).
    const card = await screen.findByRole('link', { name: FALLBACK_RECIPES[0].title })
    expect(card).toBeInTheDocument()

    await user.click(card)
    const detail = await screen.findByTestId('recipe-detail')
    expect(within(detail).getByText(new RegExp(FALLBACK_RECIPES[0].id))).toBeInTheDocument()
  })

  it('pages older messages via the scroll-back control', async () => {
    const user = userEvent.setup()
    // 24+ seeded messages > one page of 20 → a second (older) page exists.
    renderChat(createMockChatApi({ latencyMs: 0, seedCount: 24 }))

    // The greeting is the OLDEST message, so it sits on the second page and is
    // absent until we scroll back.
    const loadMore = await screen.findByRole('button', { name: /load earlier messages/i })
    expect(screen.queryByText(/Tell me what you're craving/i)).not.toBeInTheDocument()

    await user.click(loadMore)

    // After paging, the greeting (oldest message) is now loaded.
    expect(await screen.findByText(/Tell me what you're craving/i)).toBeInTheDocument()
  })
})
