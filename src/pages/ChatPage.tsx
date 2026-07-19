import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import type {
  ConversationSummary,
  GetMessagesResponse,
  SendMessageResponse,
  StartConversationResponse,
} from '@/api/chat'
import type { ThemeContextValue } from '@/components/ThemeRoot'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useChatApi } from '@/components/chat/ChatApiContext'
import ConversationDrawer from '@/components/chat/ConversationDrawer'
import { flattenConversations, useConversations } from '@/components/chat/useConversations'
import MessageBubble, { TypingBubble } from '@/components/chat/MessageBubble'
import StateBlock from '@/components/ui/StateBlock'

const PAGE_LIMIT = 20

// The send mutation resolves to one of two shapes: a further turn in the active
// conversation, or a brand-new conversation (which also carries its summary so
// we can deep-link to it). A discriminated union keeps `conversation` type-safe.
type SendResult =
  | ({ kind: 'turn' } & SendMessageResponse)
  | ({ kind: 'start'; conversation: ConversationSummary } & SendMessageResponse)

/**
 * The chat thread (chat-ai v3 — multiple conversations). The active conversation
 * comes from the URL: /chat is the new-conversation surface, /chat/:conversationId
 * is one thread. History loads newest-first and pages OLDER on scroll-back; the
 * input sends a message and an assistant typing state shows while the reply is in
 * flight. On a fresh /chat the first send creates the conversation and routes to
 * its /chat/:id. The ☰ button opens the ConversationDrawer (switch/rename/delete).
 */
export default function ChatPage() {
  const api = useChatApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const { mode, toggleMode } = useOutletContext<ThemeContextValue>()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScroll = useRef(false)

  // The conversation list feeds the header title (and the drawer). Cheap: one
  // shared cache, already loaded whenever the drawer has been opened.
  const conversations = useConversations()
  const activeTitle = flattenConversations(conversations.data?.pages).find((c) => c.id === conversationId)?.title

  const history = useInfiniteQuery({
    queryKey: queryKeys.chat.conversationMessages(conversationId ?? '__new__'),
    queryFn: ({ pageParam }) => api.getMessages(conversationId!, { cursor: pageParam, limit: PAGE_LIMIT }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!conversationId,
  })

  // pages are newest-first (CreatedAt DESC); flatten + reverse → oldest at top.
  const messages =
    conversationId && history.data ? [...history.data.pages.flatMap((p) => p.items)].reverse() : []

  const send = useMutation({
    mutationFn: (content: string): Promise<SendResult> => {
      if (conversationId) {
        return api.sendMessage(conversationId, content).then((r) => ({ kind: 'turn', ...r }))
      }
      return api.startConversation(content).then((r: StartConversationResponse) => ({
        kind: 'start',
        userMessage: r.userMessage,
        assistantMessage: r.assistantMessage,
        conversation: r.conversation,
      }))
    },
    onSuccess: (res) => {
      const { userMessage, assistantMessage } = res
      const newest = { items: [assistantMessage, userMessage], nextCursor: null as string | null }

      if (res.kind === 'start') {
        // A brand-new conversation: seed its message cache so the thread renders
        // without a loading flash, refresh the list, then deep-link to it.
        const newId = res.conversation.id
        queryClient.setQueryData<InfiniteData<GetMessagesResponse, string | null>>(
          queryKeys.chat.conversationMessages(newId),
          { pages: [newest], pageParams: [null] },
        )
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() })
        setPending(null)
        navigate(`/chat/${newId}`, { replace: true })
        return
      }

      // An existing conversation: prepend both turns to the newest page rather
      // than refetching (which would disturb scroll-back).
      queryClient.setQueryData<InfiniteData<GetMessagesResponse, string | null>>(
        queryKeys.chat.conversationMessages(conversationId!),
        (old) => {
          if (!old || old.pages.length === 0) return { pages: [newest], pageParams: [null] }
          const [first, ...rest] = old.pages
          return {
            ...old,
            pages: [{ ...first, items: [assistantMessage, userMessage, ...first.items] }, ...rest],
          }
        },
      )
      // Bump this conversation up the UpdatedAt-DESC list.
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations() })
      setPending(null)
      requestAnimationFrame(scrollToBottom)
    },
    onError: () => setPending(null),
  })

  function scrollToBottom() {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  // Snap to the newest message on first successful load of a conversation.
  useEffect(() => {
    if (conversationId && history.isSuccess && !didInitialScroll.current) {
      didInitialScroll.current = true
      requestAnimationFrame(scrollToBottom)
    }
  }, [conversationId, history.isSuccess])

  // Switching conversations re-arms the initial-scroll snap.
  useEffect(() => {
    didInitialScroll.current = false
  }, [conversationId])

  function submit() {
    const content = draft.trim()
    if (!content || send.isPending) return
    setDraft('')
    setPending(content)
    send.mutate(content)
    requestAnimationFrame(scrollToBottom)
  }

  const showEmptyState = !conversationId && !pending && !send.isPending

  return (
    <>
      <ConversationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeConversationId={conversationId}
      />

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
        {/* Header — NOT the .chat-header class (that's display:none on desktop,
            where the sidebar owns the theme toggle). We keep this visible on
            every breakpoint so the ☰ conversations trigger is always reachable;
            the theme toggle is rendered only off-desktop to avoid duplicating
            the sidebar's. */}
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 10 }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
            <button
              className="chat-conversations-toggle"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open conversations"
              style={{
                cursor: 'pointer',
                flexShrink: 0,
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
              }}
            >
              ☰
            </button>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {activeTitle ?? 'What are we cooking?'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>AI recipe assistant</div>
            </div>
          </div>
          {!isDesktop && (
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
          )}
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

        {conversationId && history.isLoading && <StateBlock title="Loading…" />}

        {/* New-conversation welcome (no active thread yet). */}
        {showEmptyState && (
          <div
            style={{
              background: 'var(--surface2)',
              borderRadius: '6px 18px 18px 18px',
              padding: '14px 16px',
              fontSize: 15,
              lineHeight: 1.5,
              marginBottom: 14,
              maxWidth: '88%',
              whiteSpace: 'pre-wrap',
            }}
          >
            Hey! Tell me what you're craving, how much time you have, or any dietary preferences — I'll find
            something great. This starts a new conversation; open ☰ to revisit an earlier one.
          </div>
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
          placeholder={conversationId ? 'Refine or ask something else…' : 'Ask for a recipe idea…'}
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
