// ─────────────────────────────────────────────────────────────────────────
// Mock ChatApi (chat-ai v3 — MULTIPLE conversations). Everything mock lives here.
//
// Behaviour:
//   - An in-memory set of conversations (per instance), each seeded with a canned
//     history long enough to exercise scroll-back paging (2+ pages at limit 20).
//   - listConversations: keyset-paged over the conversations, UpdatedAt DESC.
//   - getMessages: keyset-paged over ONE conversation's thread, newest first,
//     exactly like the real GET /chat/conversations/{id}/messages (cursor opaque).
//   - startConversation: creates a new conversation, titles it from the first
//     message, appends the user turn + a canned assistant reply.
//   - sendMessage: appends the user turn + a canned reply to an existing thread,
//     bumping its UpdatedAt so it rises to the top of the list.
//   - rename / delete: mutate the in-memory set.
//   - The reply's suggestedRecipes are drawn from the REAL GET /recipes list
//     (through the frozen apiFetch wrapper) when the backend is up, falling back
//     to canned RecipeResponse fixtures offline.
//   - A small artificial latency so the UI's typing/pending state is visible.
//
// Faithfulness note: the UI treats every cursor as OPAQUE, so this mock's cursor
// scheme (a keyset anchor) can differ from the backend's base64url-JSON token
// without any UI change.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { RecipeListResponse, RecipeResponse } from './types'
import type {
  ChatApi,
  ChatMessageResponse,
  ConversationListResponse,
  ConversationSummary,
  GetMessagesResponse,
  PageParams,
  SendMessageResponse,
  StartConversationResponse,
} from './chat'

// ── base64url cursor helpers ────────────────────────────────────────────────

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  return atob(padded)
}

interface CursorAnchor {
  /** updatedAt for the conversation list; createdAt for a message thread. */
  ts: string
  id: string
}

function encodeCursor(anchor: CursorAnchor): string {
  return base64UrlEncode(JSON.stringify(anchor))
}

function decodeCursor(cursor: string): CursorAnchor | null {
  try {
    return JSON.parse(base64UrlDecode(cursor)) as CursorAnchor
  } catch {
    return null
  }
}

/** Deterministic seeded conversation id (so tests can deep-link to /chat/:id). */
export function mockConversationId(n: number): string {
  return `c0000000-0000-0000-0000-${String(n).padStart(12, '0')}`
}

// ── Canned RecipeResponse fixtures (offline fallback for suggestions) ─────────
// Full wire shape so a suggestion card renders identically whether the recipe
// came from the live GET /recipes or from here.

function fixtureRecipe(
  id: string,
  title: string,
  description: string,
  overrides: Partial<RecipeResponse> = {},
): RecipeResponse {
  return {
    id,
    title,
    description,
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    totalTimeMinutes: 30,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: null,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: [],
    createdByUserId: '00000000-0000-0000-0000-000000000000',
    ...overrides,
  }
}

export const FALLBACK_RECIPES: RecipeResponse[] = [
  fixtureRecipe(
    'f1a00000-0000-0000-0000-000000000001',
    'Miso ramen',
    'A warming vegetarian broth with deep umami flavour, soft-boiled egg, chewy noodles, and seasonal vegetables.',
    {
      totalTimeMinutes: 25,
      cookTimeMinutes: 15,
      caloriesPerServing: 420,
      cuisineType: 'Japanese',
      tags: ['warm', 'umami', 'filling', 'vegetarian'],
    },
  ),
  fixtureRecipe(
    'f1a00000-0000-0000-0000-000000000002',
    'Red lentil soup',
    'Hearty red lentils simmered with cumin, tomato, and a bright squeeze of lemon — vegan and protein-rich.',
    {
      totalTimeMinutes: 30,
      caloriesPerServing: 340,
      difficulty: 'Easy',
      cuisineType: 'Middle Eastern',
      tags: ['hearty', 'protein', 'vegan'],
    },
  ),
  fixtureRecipe(
    'f1a00000-0000-0000-0000-000000000003',
    'Shakshuka',
    'Eggs gently poached in a spiced tomato and pepper sauce — fast, vegetarian, and full of flavour.',
    {
      totalTimeMinutes: 20,
      caloriesPerServing: 310,
      difficulty: 'Easy',
      cuisineType: 'North African',
      tags: ['spiced', 'eggs', 'vegetarian'],
    },
  ),
]

// ── Canned assistant copy ────────────────────────────────────────────────────

const ASSISTANT_REPLIES = [
  'Got it — here are a few options that fit what you asked for:',
  'Nice. Based on that, these should hit the spot:',
  'Here are some ideas that match — tell me to adjust anything (less spicy, fewer ingredients, quicker):',
  'On it. A few dishes that fit the bill:',
]

const GREETING =
  "Hey! Tell me what you're craving, how much time you have, or any dietary preferences — I'll find something great."

// Seeded conversation titles (also drive the first user craving of each thread).
const SEED_TITLES = ['Weeknight dinners', 'Something warm and vegan', 'Quick breakfast ideas']

// ── Mock implementation ──────────────────────────────────────────────────────

interface MockConversation {
  summary: ConversationSummary
  /** ASCENDING createdAt order internally; getMessages serves DESC. */
  thread: ChatMessageResponse[]
}

interface MockOptions {
  /** Simulated round-trip latency for sendMessage/startConversation (typing indicator). */
  latencyMs?: number
  /** Seed each conversation's thread with this many canned messages (default 24). */
  seedCount?: number
  /** How many conversations to seed (default 2). Pass 0 for a fresh-user empty state. */
  conversationCount?: number
}

/**
 * Build a fresh mock ChatApi with its own in-memory conversation set. Tests
 * construct one per case for isolation; the app-wide singleton lives in chat.ts.
 */
export function createMockChatApi(options: MockOptions = {}): ChatApi {
  const latencyMs = options.latencyMs ?? 550
  const seedCount = options.seedCount ?? 24
  const conversationCount = options.conversationCount ?? 2

  const conversations: MockConversation[] = []
  let seq = 0

  // Monotonic clock — no Date.now() so history stays deterministic across runs.
  const epoch = Date.parse('2026-06-01T09:00:00.000Z')
  let tick = 0
  function nextTimestamp(): string {
    tick += 1
    return new Date(epoch + tick * 1000).toISOString()
  }

  function nextMessageId(): string {
    seq += 1
    // Guid-shaped so it reads like a real id in the UI / URLs.
    return `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`
  }

  function makeMessage(
    role: 'user' | 'assistant',
    content: string,
    suggestedRecipes: RecipeResponse[] = [],
  ): ChatMessageResponse {
    return { id: nextMessageId(), role, content, createdAt: nextTimestamp(), suggestedRecipes }
  }

  // Seed a plausible back-and-forth so scroll-back paging has something to page.
  function seedThread(convIndex: number): ChatMessageResponse[] {
    const thread: ChatMessageResponse[] = []
    thread.push(makeMessage('assistant', GREETING))
    const opener = SEED_TITLES[convIndex % SEED_TITLES.length]
    const cravings = [
      `${opener}. About 30 minutes, nothing too heavy.`,
      'What about something with eggs for breakfast?',
      'I want something high-protein and vegan.',
      'Give me a cosy soup idea.',
      'Something quick and a bit spicy.',
    ]
    let i = 0
    while (thread.length < seedCount) {
      thread.push(makeMessage('user', cravings[i % cravings.length]))
      thread.push(
        makeMessage('assistant', ASSISTANT_REPLIES[i % ASSISTANT_REPLIES.length], rotate(FALLBACK_RECIPES, i)),
      )
      i += 1
    }
    return thread
  }

  // Seed conversations. Index 1 is created after index 0, so its UpdatedAt is
  // later → it sorts to the top of the UpdatedAt-DESC list.
  for (let c = 0; c < conversationCount; c += 1) {
    const thread = seedThread(c)
    const createdAt = thread[0]?.createdAt ?? nextTimestamp()
    const updatedAt = thread[thread.length - 1]?.createdAt ?? createdAt
    conversations.push({
      summary: { id: mockConversationId(c + 1), title: SEED_TITLES[c % SEED_TITLES.length], createdAt, updatedAt },
      thread,
    })
  }

  function find(conversationId: string): MockConversation | undefined {
    return conversations.find((c) => c.summary.id === conversationId)
  }

  async function suggestionsFor(_content: string, signal?: AbortSignal): Promise<RecipeResponse[]> {
    // Draw from the real catalogue when the backend is reachable; fall back to
    // fixtures offline (and in tests, where GET /recipes has no handler).
    try {
      const res = await apiFetch<RecipeListResponse>('/recipes', { query: { limit: 6 }, signal })
      if (res.items.length > 0) return res.items.slice(0, 3)
    } catch {
      // swallow — offline / backend down / unhandled in tests → fixtures
    }
    return FALLBACK_RECIPES.slice(0, 3)
  }

  function titleFrom(content: string): string {
    const trimmed = content.trim().replace(/\s+/g, ' ')
    return trimmed.length <= 40 ? trimmed : `${trimmed.slice(0, 39)}…`
  }

  return {
    async listConversations(params: PageParams = {}): Promise<ConversationListResponse> {
      const limit = clampLimit(params.limit)
      // UpdatedAt DESC, then Id DESC.
      const desc = [...conversations]
        .map((c) => c.summary)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? 1 : -1))

      let pool = desc
      if (params.cursor) {
        const anchor = decodeCursor(params.cursor)
        if (anchor) {
          pool = desc.filter((s) => s.updatedAt < anchor.ts || (s.updatedAt === anchor.ts && s.id < anchor.id))
        }
      }

      const items = pool.slice(0, limit)
      const hasMore = pool.length > limit
      const last = items[items.length - 1]
      const nextCursor = hasMore && last ? encodeCursor({ ts: last.updatedAt, id: last.id }) : null
      return { items, nextCursor }
    },

    async startConversation(content: string, signal?: AbortSignal): Promise<StartConversationResponse> {
      const userMessage = makeMessage('user', content)
      const suggestedRecipes = await suggestionsFor(content, signal)
      if (latencyMs > 0) await delay(latencyMs)
      const reply = ASSISTANT_REPLIES[(seq + content.length) % ASSISTANT_REPLIES.length]
      const assistantMessage = makeMessage('assistant', reply, suggestedRecipes)

      const conversation: ConversationSummary = {
        id: mockConversationId(conversations.length + 1),
        title: titleFrom(content),
        createdAt: userMessage.createdAt,
        updatedAt: assistantMessage.createdAt,
      }
      conversations.push({ summary: conversation, thread: [userMessage, assistantMessage] })
      return { conversation, userMessage, assistantMessage }
    },

    async renameConversation(conversationId: string, title: string): Promise<ConversationSummary> {
      const conv = find(conversationId)
      if (!conv) throw new Error('conversation not found')
      conv.summary = { ...conv.summary, title }
      return conv.summary
    },

    async deleteConversation(conversationId: string): Promise<void> {
      const idx = conversations.findIndex((c) => c.summary.id === conversationId)
      if (idx >= 0) conversations.splice(idx, 1)
    },

    async getMessages(conversationId: string, params: PageParams = {}): Promise<GetMessagesResponse> {
      const conv = find(conversationId)
      if (!conv) return { items: [], nextCursor: null }

      const limit = clampLimit(params.limit)
      // Newest first (CreatedAt DESC, then Id DESC — ids are monotonic here).
      const desc = [...conv.thread].reverse()

      let pool = desc
      if (params.cursor) {
        const anchor = decodeCursor(params.cursor)
        if (anchor) {
          pool = desc.filter((m) => m.createdAt < anchor.ts || (m.createdAt === anchor.ts && m.id < anchor.id))
        }
      }

      const items = pool.slice(0, limit)
      const hasMore = pool.length > limit
      const last = items[items.length - 1]
      const nextCursor = hasMore && last ? encodeCursor({ ts: last.createdAt, id: last.id }) : null
      return { items, nextCursor }
    },

    async sendMessage(conversationId: string, content: string, signal?: AbortSignal): Promise<SendMessageResponse> {
      const conv = find(conversationId)
      if (!conv) throw new Error('conversation not found')

      const userMessage = makeMessage('user', content)
      conv.thread.push(userMessage)

      const suggestedRecipes = await suggestionsFor(content, signal)
      if (latencyMs > 0) await delay(latencyMs)

      const reply = ASSISTANT_REPLIES[(seq + content.length) % ASSISTANT_REPLIES.length]
      const assistantMessage = makeMessage('assistant', reply, suggestedRecipes)
      conv.thread.push(assistantMessage)
      conv.summary = { ...conv.summary, updatedAt: assistantMessage.createdAt }

      return { userMessage, assistantMessage }
    },
  }
}

// ── small helpers ────────────────────────────────────────────────────────────

function clampLimit(limit?: number): number {
  if (!limit || limit <= 0) return 20
  return Math.min(limit, 50)
}

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr
  const n = by % arr.length
  return [...arr.slice(n), ...arr.slice(0, n)]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
