// ─────────────────────────────────────────────────────────────────────────
// Chat API — the ONE seam between the chat UI and its data source.
//
// NEW module (not one of the frozen shared modules). Owned by lane C.
//
// v3 — MULTIPLE conversations per user. The backend has always exposed the
// nested /chat/conversations surface (chat-ai cp3); v2 bridged it down to one
// invisible active thread, v3 surfaces the real thing. This file defines:
//   1. The wire shapes + a conversation-aware `ChatApi`, mirroring the backend
//      endpoints (chat-ai plan, ChatEndpoints.cs) 1:1:
//        POST   /chat/conversations                 { content }
//          → 200 { conversation, userMessage, assistantMessage }
//        GET    /chat/conversations?cursor=&limit=
//          → 200 { items: ConversationSummary[], nextCursor }   (UpdatedAt DESC, Id DESC)
//        PATCH  /chat/conversations/{id}            { title }
//          → 200 ConversationSummary
//        DELETE /chat/conversations/{id}            → 204
//        POST   /chat/conversations/{id}/messages   { content }
//          → 200 { userMessage, assistantMessage }              (both ChatMessageResponse)
//        GET    /chat/conversations/{id}/messages?cursor=&limit=
//          → 200 { items, nextCursor }                          (CreatedAt DESC, Id DESC)
//   2. The active provider — a single exported `chatApi`. Production creates the
//      real client; tests inject a fresh mock per case via ChatApiContext.
//      Nothing outside this file knows which implementation is active.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeResponse } from './types'
import { createRealChatApi } from './chat.real'

/**
 * ChatMessageResponse — 1:1 with the backend DTO
 * (Guid Id, string Role, string Content, DateTime CreatedAt,
 *  List<RecipeResponse> SuggestedRecipes). Guids/DateTimes arrive as strings;
 * `suggestedRecipes` are FULL recipe objects, not ids (the backend hydrates
 * them and silently omits soft-deleted / no-longer-visible ones).
 */
export interface ChatMessageResponse {
  id: string
  /** "user" | "assistant" in v1 (backend types it as an open string). */
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  suggestedRecipes: RecipeResponse[]
}

/**
 * ConversationSummary — 1:1 with the backend ConversationResponse
 * (Guid Id, string Title, DateTime CreatedAt, DateTime UpdatedAt). The list is
 * ordered UpdatedAt DESC so the most recently active thread sits on top.
 */
export interface ConversationSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

/** POST /chat/conversations → 200 body (a brand-new conversation's first turn). */
export interface StartConversationResponse {
  conversation: ConversationSummary
  userMessage: ChatMessageResponse
  assistantMessage: ChatMessageResponse
}

/** POST /chat/conversations/{id}/messages → 200 body (a further turn). */
export interface SendMessageResponse {
  userMessage: ChatMessageResponse
  assistantMessage: ChatMessageResponse
}

/** Keyset paging params shared by both list endpoints. cursor is an opaque base64url token. */
export interface PageParams {
  cursor?: string | null
  /** default 20, capped at 50 by the backend. */
  limit?: number
}

/** GET /chat/conversations → 200 body. Ordered UpdatedAt DESC, Id DESC. */
export interface ConversationListResponse {
  items: ConversationSummary[]
  /** null on the last (oldest) page. */
  nextCursor: string | null
}

/** GET /chat/conversations/{id}/messages → 200 body. Ordered CreatedAt DESC, Id DESC. */
export interface GetMessagesResponse {
  items: ChatMessageResponse[]
  /** null on the last (oldest) page. */
  nextCursor: string | null
}

/**
 * The one seam every chat data call goes through. The real implementation
 * routes these through the frozen `apiFetch` wrapper (which prefixes /api,
 * attaches the bearer, and throws typed errors — a 502 AssistantUnavailable
 * surfaces as ApiError). The mock serves canned data for tests.
 */
export interface ChatApi {
  /** GET /chat/conversations — one page of the caller's conversations, newest-active first. */
  listConversations(params?: PageParams, signal?: AbortSignal): Promise<ConversationListResponse>
  /** POST /chat/conversations — create a conversation, title it, run its first turn. */
  startConversation(content: string, signal?: AbortSignal): Promise<StartConversationResponse>
  /** PATCH /chat/conversations/{id} — rename a conversation. */
  renameConversation(conversationId: string, title: string, signal?: AbortSignal): Promise<ConversationSummary>
  /** DELETE /chat/conversations/{id} — soft-delete a conversation. */
  deleteConversation(conversationId: string, signal?: AbortSignal): Promise<void>
  /** POST /chat/conversations/{id}/messages — persist the user turn, get the assistant's reply. */
  sendMessage(conversationId: string, content: string, signal?: AbortSignal): Promise<SendMessageResponse>
  /** GET /chat/conversations/{id}/messages — one page of a conversation's history, newest first. */
  getMessages(conversationId: string, params?: PageParams, signal?: AbortSignal): Promise<GetMessagesResponse>
}

// ── Active provider ─────────────────────────────────────────────────────────
// The REAL client, talking to the /chat/conversations routes (see chat.real.ts).
// The mock stays available via `createMockChatApi` (chat.mock.ts) for tests.
export const chatApi: ChatApi = createRealChatApi()
