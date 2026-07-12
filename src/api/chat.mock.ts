// ─────────────────────────────────────────────────────────────────────────
// Mock ChatApi (checkpoint 07). Everything mock lives here.
//
// Behaviour:
//   - An in-memory thread (one per instance), seeded with a canned history long
//     enough to exercise scroll-back paging (2+ pages at the default limit 20).
//   - getMessages: keyset-paged over the thread, newest first, exactly like the
//     real GET /chat/messages (cursor is an opaque base64url token).
//   - sendMessage: appends the user turn + a canned assistant reply. The reply's
//     suggestedRecipes are drawn from the REAL GET /recipes list (through the
//     frozen apiFetch wrapper) when the backend is up, falling back to canned
//     RecipeResponse fixtures offline.
//   - A small artificial latency so the UI's typing/pending state is visible.
//
// Faithfulness note for checkpoint 08: the UI treats the cursor as OPAQUE, so
// this mock's cursor scheme (a {createdAt,id} keyset anchor) can differ from the
// backend's base64url-JSON token without any UI change.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { RecipeListResponse, RecipeResponse } from './types'
import type {
  ChatApi,
  ChatMessageResponse,
  GetMessagesParams,
  GetMessagesResponse,
  SendMessageResponse,
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
  createdAt: string
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

// ── Mock implementation ──────────────────────────────────────────────────────

interface MockOptions {
  /** Simulated round-trip latency for sendMessage (typing indicator). */
  latencyMs?: number
  /** Seed the thread with this many canned history messages (default 24). */
  seedCount?: number
}

/**
 * Build a fresh mock ChatApi with its own in-memory thread. Tests construct one
 * per case for isolation; the app-wide singleton is created once in chat.ts.
 */
export function createMockChatApi(options: MockOptions = {}): ChatApi {
  const latencyMs = options.latencyMs ?? 550
  const seedCount = options.seedCount ?? 24

  // Thread kept in ASCENDING createdAt order internally; getMessages serves DESC.
  const thread: ChatMessageResponse[] = []
  let seq = 0

  // Monotonic clock — no Date.now() so history stays deterministic across runs.
  const epoch = Date.parse('2026-06-01T09:00:00.000Z')
  let tick = 0
  function nextTimestamp(): string {
    tick += 1
    return new Date(epoch + tick * 1000).toISOString()
  }

  function nextId(): string {
    seq += 1
    // Guid-shaped so it reads like a real id in the UI / URLs.
    return `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`
  }

  function makeMessage(
    role: 'user' | 'assistant',
    content: string,
    suggestedRecipes: RecipeResponse[] = [],
  ): ChatMessageResponse {
    return { id: nextId(), role, content, createdAt: nextTimestamp(), suggestedRecipes }
  }

  // Seed a plausible back-and-forth so scroll-back paging has something to page.
  function seed(): void {
    thread.push(makeMessage('assistant', GREETING))
    const cravings = [
      'Something warm and filling, not too heavy. About 30 minutes. No meat.',
      'What about something with eggs for breakfast?',
      'I want something high-protein and vegan.',
      'Give me a cosy soup idea.',
      'Something quick and a bit spicy.',
    ]
    let i = 0
    while (thread.length < seedCount) {
      thread.push(makeMessage('user', cravings[i % cravings.length]))
      thread.push(
        makeMessage(
          'assistant',
          ASSISTANT_REPLIES[i % ASSISTANT_REPLIES.length],
          rotate(FALLBACK_RECIPES, i),
        ),
      )
      i += 1
    }
  }
  seed()

  async function suggestionsFor(_content: string, signal?: AbortSignal): Promise<RecipeResponse[]> {
    // Draw from the real catalogue when the backend is reachable; fall back to
    // fixtures offline (and in tests, where GET /recipes has no handler).
    try {
      const res = await apiFetch<RecipeListResponse>('/recipes', {
        query: { limit: 6 },
        signal,
      })
      if (res.items.length > 0) return res.items.slice(0, 3)
    } catch {
      // swallow — offline / backend down / unhandled in tests → fixtures
    }
    return FALLBACK_RECIPES.slice(0, 3)
  }

  return {
    async getMessages(params: GetMessagesParams = {}): Promise<GetMessagesResponse> {
      const limit = clampLimit(params.limit)
      // Newest first (CreatedAt DESC, then Id DESC — ids are monotonic here).
      const desc = [...thread].reverse()

      let pool = desc
      if (params.cursor) {
        const anchor = decodeCursor(params.cursor)
        if (anchor) {
          pool = desc.filter(
            (m) =>
              m.createdAt < anchor.createdAt ||
              (m.createdAt === anchor.createdAt && m.id < anchor.id),
          )
        }
      }

      const items = pool.slice(0, limit)
      const hasMore = pool.length > limit
      const last = items[items.length - 1]
      const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null
      return { items, nextCursor }
    },

    async sendMessage(content: string, signal?: AbortSignal): Promise<SendMessageResponse> {
      const userMessage = makeMessage('user', content)
      thread.push(userMessage)

      const suggestedRecipes = await suggestionsFor(content, signal)
      if (latencyMs > 0) await delay(latencyMs)

      const reply = ASSISTANT_REPLIES[(seq + content.length) % ASSISTANT_REPLIES.length]
      const assistantMessage = makeMessage('assistant', reply, suggestedRecipes)
      thread.push(assistantMessage)

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
