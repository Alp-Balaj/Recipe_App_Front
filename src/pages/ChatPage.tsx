import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
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
import CreatePanel, { CreateHandoff } from '@/components/chat/CreatePanel'
import { useCreateRecipe, MAX_PROMPT_LENGTH } from '@/components/chat/useCreateRecipe'
import { SearchIcon, SendArrowIcon, SparkIcon } from '@/components/chat/chatIcons'
import StateBlock from '@/components/ui/StateBlock'

const PAGE_LIMIT = 20

/**
 * Which engine the composer is talking to.
 *
 * It rides in the QUERY STRING (`?mode=create`), not the path, because
 * `src/router.tsx` is frozen — a mode is a state of the chat surface, not a
 * seventh route, and this way the choice survives a refresh and a shared link
 * without registering anything. Anything other than `create` means library, so
 * a mangled URL degrades to the grounded tab rather than the spending one.
 */
type ChatMode = 'library' | 'create'

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
 *
 * The page carries TWO engines and they are not interchangeable. Library is
 * grounded — the assistant may only point at recipes that already exist. Create
 * invents one and saves it, spending a call from a daily budget. They used to
 * share a screen, each with its own text field, which left the composer unable
 * to say which of them the next Enter would reach. Now they are tabs: one
 * composer, and every visible thing about it — the tab, the header, the
 * placeholder, the send icon — follows the mode.
 */
export default function ChatPage() {
  const api = useChatApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const { mode: themeMode, toggleMode } = useOutletContext<ThemeContextValue>()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [searchParams, setSearchParams] = useSearchParams()
  const chatMode: ChatMode = searchParams.get('mode') === 'create' ? 'create' : 'library'
  const isCreate = chatMode === 'create'

  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const didInitialScroll = useRef(false)

  function setChatMode(next: ChatMode) {
    const params = new URLSearchParams(searchParams)
    if (next === 'create') params.set('mode', 'create')
    else params.delete('mode')
    // replace: switching engines is not a place worth stepping back through.
    setSearchParams(params, { replace: true })
    // A brief written for one engine is rarely the right prompt for the other.
    setDraft('')
  }

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

  // The generate lane. Mounted in both modes so a result survives a trip back to
  // Library and in again — the tab is a view onto the same page, not a remount.
  const create = useCreateRecipe(conversationId)

  const overLength = isCreate && draft.trim().length > MAX_PROMPT_LENGTH
  const canGenerate = !!draft.trim() && !overLength && !create.isPending && !create.isQuotaSpent
  const canSend = isCreate ? canGenerate : !!draft.trim() && !send.isPending
  const showEmptyState = !isCreate && !conversationId && !pending && !send.isPending

  function submit() {
    const content = draft.trim()
    if (!content) return

    if (isCreate) {
      if (!canGenerate) return
      setDraft('')
      create.submit(content)
      requestAnimationFrame(scrollToBottom)
      return
    }

    if (send.isPending) return
    setDraft('')
    setPending(content)
    send.mutate(content)
    requestAnimationFrame(scrollToBottom)
  }

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
            {!isDesktop && (
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
            )}
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
                {isCreate ? 'Create a recipe' : activeTitle ?? 'What are we cooking?'}
              </div>
              {/* These tabs stand where an "AI recipe assistant" subtitle used to.
                  That line was decoration — it named the page, which the user had
                  just tapped to get to. The tabs say something the user cannot
                  otherwise know: which of two engines is listening. */}
              <div role="tablist" aria-label="Chat mode" style={tabRow}>
                <button
                  role="tab"
                  aria-selected={!isCreate}
                  onClick={() => setChatMode('library')}
                  style={{ ...tabBase, ...(isCreate ? tabIdle : tabLibraryOn) }}
                >
                  <SearchIcon size={13} />
                  Library
                </button>
                <button
                  role="tab"
                  aria-selected={isCreate}
                  onClick={() => setChatMode('create')}
                  style={{ ...tabBase, ...(isCreate ? tabCreateOn : tabIdle) }}
                >
                  <SparkIcon size={13} />
                  Create
                </button>
              </div>
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
              {themeMode === 'dark' ? '☀' : '☾'}
            </button>
          )}
        </div>

        {/* Scroll-back: load older messages */}
        {!isCreate && history.hasNextPage && (
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

        {!isCreate && conversationId && history.isLoading && <StateBlock title="Loading…" />}

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

        {!isCreate && messages.map((message) => <MessageBubble key={message.id} message={message} />)}

        {/* Optimistic pending turn + typing indicator */}
        {!isCreate && pending && (
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
        {!isCreate && send.isPending && <TypingBubble />}

        {/* Stream E kept the generator at the FOOT of the thread — "none of these?
            then write me a new one" is the moment it belongs to. That moment is
            still right; what changed is that taking it up now moves you to a
            surface that says what it does, instead of dropping a second text
            field into a thread that already had one. Hidden while a turn is in
            flight so the two AI actions can't be fired at each other. */}
        {!isCreate && !send.isPending && <CreateHandoff onCreate={() => setChatMode('create')} />}

        {isCreate && (
          <CreatePanel
            state={create}
            conversationTitle={activeTitle}
            onSearchInstead={() => setChatMode('library')}
          />
        )}
      </div>

      {/* Input bar.
          z-index is load-bearing, not cosmetic: BottomNav's "+" FAB is painted
          after this page and carries z-index 5, and at bottom 88 / right 16 it
          enclosed 40 of send's 42 vertical pixels — so the button users were
          pressing to send was the one that navigates to the manual recipe form.
          BottomNav now hides that FAB on /chat, and this stacking context is the
          belt to its braces: nothing floated over the page can silently swallow
          send again. */}
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
          zIndex: 6,
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
          placeholder={
            isCreate
              ? 'Describe a dish…'
              : conversationId
                ? 'Refine or ask something else…'
                : 'Search my recipes…'
          }
          disabled={isCreate && (create.isPending || create.isQuotaSpent)}
          aria-label={isCreate ? 'Describe the recipe to generate' : 'Message the assistant'}
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
            minWidth: 0,
          }}
        />
        {/*
          The send button is where the two engines are easiest to confuse, so it
          carries the distinction three ways. The ICON is the one that matters:
          an arrow means "send this", a spark means "invent something". Colour
          only agrees with it — in the light theme --olive IS --accent-fill
          (index.css:233), one step off --accent, so a colour-only signal would
          say nothing there and everything in dark. Shape survives both themes,
          greyscale, and colourblindness.
        */}
        <button
          onClick={submit}
          disabled={!canSend}
          aria-label={isCreate ? 'Generate recipe' : 'Send message'}
          style={{
            flexShrink: 0,
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: isCreate ? 'var(--olive)' : 'var(--accent)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isCreate ? 'var(--olive-ink)' : 'var(--accent-ink)',
            cursor: canSend ? 'pointer' : 'default',
            opacity: canSend ? 1 : 0.55,
          }}
        >
          {isCreate ? <SparkIcon size={17} /> : <SendArrowIcon size={18} />}
        </button>
      </div>

      {overLength && (
        <div role="status" style={overLengthNotice}>
          That's a long brief — keep it under {MAX_PROMPT_LENGTH} characters.
        </div>
      )}
    </>
  )
}

const tabRow: CSSProperties = { display: 'flex', gap: 6, marginTop: 7 }

const tabBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  padding: '6px 12px 7px',
  borderRadius: 999,
  border: '1px solid transparent',
  background: 'none',
  cursor: 'pointer',
}

const tabIdle: CSSProperties = { color: 'var(--muted)' }

const tabLibraryOn: CSSProperties = {
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  borderColor: 'var(--border)',
}

const tabCreateOn: CSSProperties = {
  background: 'var(--accent-soft)',
  color: 'var(--olive)',
  borderColor: 'var(--olive)',
}

const overLengthNotice: CSSProperties = {
  position: 'absolute',
  left: 18,
  right: 18,
  bottom: 'calc(var(--nav-h, 74px) + 64px)',
  zIndex: 6,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--muted)',
}
