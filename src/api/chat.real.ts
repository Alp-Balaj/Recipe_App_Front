// ─────────────────────────────────────────────────────────────────────────
// Real ChatApi (checkpoint 08 / chat-ai v2). Bridges the frozen SINGLE-THREAD
// `ChatApi` (sendMessage / getMessages) onto the backend's MULTI-conversation
// surface (/chat/conversations + /{id}/messages) via one transparent, lazily
// resolved active conversation. Nothing outside this file learns about
// conversations — the "flip ONE line in chat.ts" design holds.
//
// New module (not one of the frozen shared modules). Owned by lane C. Routes
// every call through the frozen `apiFetch` wrapper (prefixes /api, attaches the
// bearer, throws typed errors — a 502 AssistantUnavailable surfaces as ApiError,
// which the UI's existing error handling already exercises).
//
// A conversation sidebar (list/switch/rename/delete) over the same backend
// routes is a clean follow-up; v2 wires a single active thread only.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type {
  ChatApi,
  ChatMessageResponse,
  GetMessagesParams,
  GetMessagesResponse,
  SendMessageResponse,
} from './chat'

// ── Backend conversation envelopes (not in the frozen @/api/types) ───────────
// These are the /chat/conversations wire shapes. The per-message shape reuses
// `ChatMessageResponse` from chat.ts (1:1 with the backend DTO).

interface ConversationResponse {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/** POST /chat/conversations → 200 (first turn of a brand-new conversation). */
interface StartConversationResponse {
  conversation: ConversationResponse
  userMessage: ChatMessageResponse
  assistantMessage: ChatMessageResponse
}

/** POST /chat/conversations/{id}/messages → 200 (a further turn). */
interface TurnResponse {
  userMessage: ChatMessageResponse
  assistantMessage: ChatMessageResponse
}

/** GET /chat/conversations → 200 (UpdatedAt DESC, Id DESC keyset page). */
interface ConversationListResponse {
  items: ConversationResponse[]
  nextCursor: string | null
}

/** GET /chat/conversations/{id}/messages → 200 (CreatedAt DESC, Id DESC page). */
interface ChatMessageListResponse {
  items: ChatMessageResponse[]
  nextCursor: string | null
}

/**
 * Build the real ChatApi. State (the active conversation id) is closure-scoped,
 * exactly like createMockChatApi's thread: production creates ONE instance in
 * chat.ts, so this behaves as a single module-wide active thread; tests build a
 * fresh instance per case for isolation.
 */
export function createRealChatApi(): ChatApi {
  // Lazily resolved: null until the first send starts a conversation or the
  // first history load adopts the caller's most-recent existing one.
  let activeConversationId: string | null = null

  return {
    async sendMessage(content: string, signal?: AbortSignal): Promise<SendMessageResponse> {
      if (activeConversationId === null) {
        // No active thread yet → start one. The first turn runs inside the POST.
        const res = await apiFetch<StartConversationResponse>('/chat/conversations', {
          method: 'POST',
          body: { content },
          signal,
        })
        activeConversationId = res.conversation.id
        // Drop the conversation wrapper — the UI's SendMessageResponse is just the pair.
        return { userMessage: res.userMessage, assistantMessage: res.assistantMessage }
      }

      // Existing thread → a further turn. TurnResponse is already the pair shape.
      return apiFetch<TurnResponse>(`/chat/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        body: { content },
        signal,
      })
    },

    async getMessages(params: GetMessagesParams = {}, signal?: AbortSignal): Promise<GetMessagesResponse> {
      if (activeConversationId === null) {
        // Cold load: adopt the caller's newest conversation (UpdatedAt DESC), if any.
        const list = await apiFetch<ConversationListResponse>('/chat/conversations', {
          query: { limit: 1 },
          signal,
        })
        if (list.items.length === 0) {
          // Fresh user, no history — nothing to page. A later sendMessage creates one.
          return { items: [], nextCursor: null }
        }
        activeConversationId = list.items[0].id
      }

      const res = await apiFetch<ChatMessageListResponse>(
        `/chat/conversations/${activeConversationId}/messages`,
        {
          query: { cursor: params.cursor, limit: params.limit },
          signal,
        },
      )
      // Already the UI's GetMessagesResponse shape (newest-first keyset page).
      return { items: res.items, nextCursor: res.nextCursor }
    },
  }
}
