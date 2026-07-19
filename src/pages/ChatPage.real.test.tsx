import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
// Real-client bridge tests. ChatPage is driven through createRealChatApi()
// (the actual production client), with MSW standing in for the backend's
// /chat/conversations surface. These verify the single-thread → conversation
// bridge in chat.real.ts: the three branches (B3) plus the identical UI render.
// ─────────────────────────────────────────────────────────────────────────

const theme: ThemeContextValue = { mode: 'dark', setMode: () => {}, toggleMode: () => {} }

function renderRealChat() {
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
      {/* A fresh real client per case → its own lazily-resolved active conversation. */}
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

// ── envelope fixtures ────────────────────────────────────────────────────────

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

function conversation(id = CONVERSATION_ID) {
  return { id, title: 'A chat', createdAt: '2026-07-19T10:00:00Z', updatedAt: '2026-07-19T10:00:00Z' }
}

describe('ChatPage (real client bridge)', () => {
  it('(a) first send with no active conversation → POST /chat/conversations', async () => {
    const user = userEvent.setup()
    let startBody: { content: string } | null = null

    server.use(
      // Cold load: fresh user, no conversations yet.
      http.get('*/chat/conversations', () => HttpResponse.json({ items: [], nextCursor: null })),
      // First turn starts the conversation.
      http.post('*/chat/conversations', async ({ request }) => {
        startBody = (await request.json()) as { content: string }
        return HttpResponse.json({
          conversation: conversation(),
          userMessage: makeMessage('user', startBody!.content),
          assistantMessage: makeMessage('assistant', 'Here is a first idea for you.'),
        })
      }),
    )

    renderRealChat()
    // Cold load settles with an empty thread (no greeting from a real backend).
    await waitFor(() => expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument())

    await user.type(screen.getByLabelText('Message the assistant'), 'something warm')
    await user.click(screen.getByLabelText('Send message'))

    expect(await screen.findByText('Here is a first idea for you.')).toBeInTheDocument()
    expect(screen.getByText('something warm')).toBeInTheDocument()
    expect(startBody).toEqual({ content: 'something warm' })
  })

  it('(b) subsequent send → POST /chat/conversations/{id}/messages', async () => {
    const user = userEvent.setup()
    const turnUrls: string[] = []

    server.use(
      http.get('*/chat/conversations', () => HttpResponse.json({ items: [], nextCursor: null })),
      http.post('*/chat/conversations', () =>
        HttpResponse.json({
          conversation: conversation(),
          userMessage: makeMessage('user', 'first'),
          assistantMessage: makeMessage('assistant', 'reply one'),
        }),
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

    renderRealChat()
    await waitFor(() => expect(screen.queryByText(/Loading…/)).not.toBeInTheDocument())

    // First send creates the conversation (POST /conversations, sets active id)…
    await user.type(screen.getByLabelText('Message the assistant'), 'first')
    await user.click(screen.getByLabelText('Send message'))
    await screen.findByText('reply one')

    // …the second send routes to the existing conversation's /messages endpoint.
    await user.type(screen.getByLabelText('Message the assistant'), 'again')
    await user.click(screen.getByLabelText('Send message'))
    expect(await screen.findByText('reply two')).toBeInTheDocument()

    expect(turnUrls).toEqual([CONVERSATION_ID])
  })

  it('(c) cold load with existing history → GET /conversations then GET /{id}/messages', async () => {
    let listHit = false
    const messagesUrls: string[] = []

    server.use(
      http.get('*/chat/conversations/:id/messages', ({ params }) => {
        messagesUrls.push(String(params.id))
        // Newest-first page (CreatedAt DESC), like the real endpoint.
        return HttpResponse.json({
          items: [makeMessage('assistant', 'welcome back'), makeMessage('user', 'earlier question')],
          nextCursor: null,
        })
      }),
      http.get('*/chat/conversations', () => {
        listHit = true
        return HttpResponse.json({ items: [conversation()], nextCursor: null })
      }),
    )

    renderRealChat()

    expect(await screen.findByText('welcome back')).toBeInTheDocument()
    expect(screen.getByText('earlier question')).toBeInTheDocument()
    expect(listHit).toBe(true)
    expect(messagesUrls).toEqual([CONVERSATION_ID])
  })
})
