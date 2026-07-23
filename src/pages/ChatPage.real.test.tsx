import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Outlet, RouterProvider, createMemoryRouter, useParams } from 'react-router-dom'
import ChatPage from './ChatPage'
import { createRealChatApi } from '@/api/chat.real'
import { ChatApiProvider } from '@/components/chat/ChatApiContext'
import { server } from '@/test/msw/server'
import type { ThemeContextValue } from '@/components/ThemeRoot'
import type { ChatMessageResponse } from '@/api/chat'

// ─────────────────────────────────────────────────────────────────────────
// Real-client bridge tests (chat-ai v3). ChatPage is driven through
// createRealChatApi() (the actual production client), with MSW standing in for
// the backend's /chat/conversations surface. These verify the conversation-
// aware client: create-then-deep-link, further turns route to /{id}/messages,
// deep-load renders history, and the drawer's delete calls DELETE /{id}.
// ─────────────────────────────────────────────────────────────────────────

const theme: ThemeContextValue = { mode: 'dark', setMode: () => {}, toggleMode: () => {} }

function renderRealChat(initialPath = '/chat') {
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
      <ChatApiProvider value={createRealChatApi()}>
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

// ── fixtures ─────────────────────────────────────────────────────────────────

let seq = 0
function makeMessage(role: 'user' | 'assistant', content: string): ChatMessageResponse {
  seq += 1
  return {
    id: `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`,
    role,
    content,
    createdAt: new Date(Date.parse('2026-07-19T10:00:00.000Z') + seq * 1000).toISOString(),
    suggestedRecipes: [],
  }
}

const CONVERSATION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function conversation(id = CONVERSATION_ID, title = 'A chat') {
  return { id, title, createdAt: '2026-07-19T10:00:00Z', updatedAt: '2026-07-19T10:00:00Z' }
}

describe('ChatPage (real client bridge)', () => {
  it('(a) first send on /chat → POST /chat/conversations, then deep-links to /chat/:id', async () => {
    const user = userEvent.setup()
    let startBody: { content: string } | null = null

    server.use(
      http.get('*/chat/conversations', () => HttpResponse.json({ items: [], nextCursor: null })),
      http.post('*/chat/conversations', async ({ request }) => {
        startBody = (await request.json()) as { content: string }
        return HttpResponse.json({
          conversation: conversation(),
          userMessage: makeMessage('user', startBody!.content),
          assistantMessage: makeMessage('assistant', 'Here is a first idea for you.'),
        })
      }),
      // After the deep-link, the newly-enabled messages query background-refetches
      // this conversation — the realistic backend returns the just-created turns.
      http.get('*/chat/conversations/:id/messages', () =>
        HttpResponse.json({
          items: [makeMessage('assistant', 'Here is a first idea for you.'), makeMessage('user', 'something warm')],
          nextCursor: null,
        }),
      ),
    )

    const router = renderRealChat('/chat')
    await screen.findByText(/This starts a new conversation/i)

    await user.type(screen.getByLabelText('Message the assistant'), 'something warm')
    await user.click(screen.getByLabelText('Send message'))

    // waitFor + getByText (not findByText): the send deep-links /chat → /chat/:id,
    // which REMOUNTS ChatPage — a node caught mid-transition can be detached by
    // assertion time. Re-querying each attempt pins the settled DOM instead.
    await waitFor(() => expect(screen.getByText('Here is a first idea for you.')).toBeInTheDocument())
    expect(screen.getByText('something warm')).toBeInTheDocument()
    expect(startBody).toEqual({ content: 'something warm' })
    await waitFor(() => expect(router.state.location.pathname).toBe(`/chat/${CONVERSATION_ID}`))
  })

  it('(b) a further send on /chat/:id → POST /chat/conversations/{id}/messages', async () => {
    const user = userEvent.setup()
    const turnUrls: string[] = []

    server.use(
      http.get('*/chat/conversations', () => HttpResponse.json({ items: [conversation()], nextCursor: null })),
      http.get('*/chat/conversations/:id/messages', () =>
        HttpResponse.json({ items: [makeMessage('assistant', 'earlier reply')], nextCursor: null }),
      ),
      http.post('*/chat/conversations/:id/messages', async ({ request, params }) => {
        turnUrls.push(String(params.id))
        const body = (await request.json()) as { content: string }
        return HttpResponse.json({
          userMessage: makeMessage('user', body.content),
          assistantMessage: makeMessage('assistant', 'reply two'),
        })
      }),
    )

    renderRealChat(`/chat/${CONVERSATION_ID}`)
    await screen.findByText('earlier reply')

    await user.type(screen.getByLabelText('Message the assistant'), 'again')
    await user.click(screen.getByLabelText('Send message'))
    expect(await screen.findByText('reply two')).toBeInTheDocument()

    expect(turnUrls).toEqual([CONVERSATION_ID])
  })

  it('(c) deep-load /chat/:id → GET /{id}/messages renders history', async () => {
    const messagesUrls: string[] = []

    server.use(
      http.get('*/chat/conversations/:id/messages', ({ params }) => {
        messagesUrls.push(String(params.id))
        return HttpResponse.json({
          items: [makeMessage('assistant', 'welcome back'), makeMessage('user', 'earlier question')],
          nextCursor: null,
        })
      }),
      http.get('*/chat/conversations', () => HttpResponse.json({ items: [conversation()], nextCursor: null })),
    )

    renderRealChat(`/chat/${CONVERSATION_ID}`)

    expect(await screen.findByText('welcome back')).toBeInTheDocument()
    expect(screen.getByText('earlier question')).toBeInTheDocument()
    expect(messagesUrls).toEqual([CONVERSATION_ID])
  })

  it('(d) the drawer deletes a conversation → DELETE /chat/conversations/{id}', async () => {
    const user = userEvent.setup()
    const deleteUrls: string[] = []

    server.use(
      http.get('*/chat/conversations', () =>
        HttpResponse.json({ items: [conversation(CONVERSATION_ID, 'Dinner ideas')], nextCursor: null }),
      ),
      http.get('*/chat/conversations/:id/messages', () =>
        HttpResponse.json({ items: [makeMessage('assistant', 'hi there')], nextCursor: null }),
      ),
      http.delete('*/chat/conversations/:id', ({ params }) => {
        deleteUrls.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const router = renderRealChat(`/chat/${CONVERSATION_ID}`)
    await screen.findByText('hi there')

    await user.click(screen.getByLabelText('Open conversations'))
    const drawer = await screen.findByRole('dialog', { name: 'Conversations' })

    await user.click(within(drawer).getByRole('button', { name: 'Delete Dinner ideas' }))
    await user.click(within(drawer).getByRole('button', { name: 'Confirm delete Dinner ideas' }))

    await waitFor(() => expect(deleteUrls).toEqual([CONVERSATION_ID]))
    await waitFor(() => expect(router.state.location.pathname).toBe('/chat'))
  })
})
