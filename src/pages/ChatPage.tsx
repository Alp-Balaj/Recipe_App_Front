import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type { GetMessagesResponse, SendMessageResponse } from '@/api/chat'
import type { ThemeContextValue } from '@/components/ThemeRoot'
import { useChatApi } from '@/components/chat/ChatApiContext'
import MessageBubble, { TypingBubble } from '@/components/chat/MessageBubble'

const PAGE_LIMIT = 20

/**
 * The chat thread. History loads newest-first and pages OLDER on scroll-back;
 * the input sends a message and an assistant typing state shows while the reply
 * is in flight. The data source is whatever ChatApi the context provides —
 * the mock at checkpoint 07, the real client at 08 (a one-line swap in chat.ts).
 */
export default function ChatPage() {
  const api = useChatApi()
  const queryClient = useQueryClient()
  const { mode, toggleMode } = useOutletContext<ThemeContextValue>()

  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScroll = useRef(false)

  const history = useInfiniteQuery({
    queryKey: queryKeys.chat.messages(),
    queryFn: ({ pageParam }) => api.getMessages({ cursor: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  // pages are newest-first (CreatedAt DESC); flatten + reverse → oldest at top.
  const messages = history.data ? [...history.data.pages.flatMap((p) => p.items)].reverse() : []

  const send = useMutation({
    mutationFn: (content: string) => api.sendMessage(content),
    onSuccess: ({ userMessage, assistantMessage }: SendMessageResponse) => {
      // The POST response already carries both turns — prepend them to the
      // newest page rather than refetching (which would disturb scroll-back).
      queryClient.setQueryData<InfiniteData<GetMessagesResponse, string | null>>(
        queryKeys.chat.messages(),
        (old) => {
          const newest = { items: [assistantMessage, userMessage], nextCursor: null as string | null }
          if (!old || old.pages.length === 0) {
            return { pages: [newest], pageParams: [null] }
          }
          const [first, ...rest] = old.pages
          return {
            ...old,
            pages: [{ ...first, items: [assistantMessage, userMessage, ...first.items] }, ...rest],
          }
        },
      )
      setPending(null)
      requestAnimationFrame(scrollToBottom)
    },
    onError: () => setPending(null),
  })

  function scrollToBottom() {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // Snap to the newest message on first successful load.
  useEffect(() => {
    if (history.isSuccess && !didInitialScroll.current) {
      didInitialScroll.current = true
      requestAnimationFrame(scrollToBottom)
    }
  }, [history.isSuccess])

  function submit() {
    const content = draft.trim()
    if (!content || send.isPending) return
    setDraft('')
    setPending(content)
    send.mutate(content)
    requestAnimationFrame(scrollToBottom)
  }

  return (
    <>
      <div
        ref={scrollRef}
        className="scroll"
        style={{
          position: 'absolute',
          inset: 0,
          bottom: 'var(--nav-h, 74px)',
          overflowY: 'auto',
          padding: '54px 18px 80px',
        }}
      >
        {/* Header */}
        <div
          className="chat-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>What are we cooking?</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>AI recipe assistant</div>
          </div>
          <button
            className="chat-theme-toggle"
            onClick={toggleMode}
            aria-label="Toggle theme"
            style={{
              cursor: 'pointer',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--surface2)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              color: 'var(--text)',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {mode === 'dark' ? '☀' : '☾'}
          </button>
        </div>

        {/* Scroll-back: load older messages */}
        {history.hasNextPage && (
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <button
              onClick={() => history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
              style={{
                cursor: history.isFetchingNextPage ? 'default' : 'pointer',
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '7px 16px',
                fontSize: 13,
                color: 'var(--muted)',
                fontFamily: 'inherit',
              }}
            >
              {history.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}

        {history.isLoading && (
          <div style={{ color: 'var(--muted)', fontSize: 14, textAlign: 'center', padding: 20 }}>Loading…</div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Optimistic pending turn + typing indicator */}
        {pending && (
          <div
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              borderRadius: '18px 6px 18px 18px',
              padding: '14px 16px',
              fontSize: 15,
              lineHeight: 1.5,
              margin: '0 0 12px auto',
              maxWidth: '82%',
              fontWeight: 500,
              whiteSpace: 'pre-wrap',
            }}
          >
            {pending}
          </div>
        )}
        {send.isPending && <TypingBubble />}
      </div>

      {/* Input bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'var(--nav-h, 74px)',
          padding: '10px 18px 12px',
          background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
          display: 'flex',
          gap: 9,
          alignItems: 'center',
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Refine or ask something else…"
          aria-label="Message the assistant"
          style={{
            flex: 1,
            background: 'var(--inputbg)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '12px 16px',
            fontSize: 13.5,
            color: 'var(--text)',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || send.isPending}
          aria-label="Send message"
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-ink)',
            fontSize: 18,
            cursor: !draft.trim() || send.isPending ? 'default' : 'pointer',
            opacity: !draft.trim() || send.isPending ? 0.55 : 1,
          }}
        >
          ↑
        </button>
      </div>
    </>
  )
}
