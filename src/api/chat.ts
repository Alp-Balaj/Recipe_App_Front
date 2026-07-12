// ─────────────────────────────────────────────────────────────────────────
// Chat API — the ONE seam between the chat UI and its data source.
//
// NEW module (not one of the frozen shared modules). Owned by lane C.
//
// This file defines:
//   1. The wire shapes + `ChatApi` interface, mirroring the chat-ai plan's
//      "Wire contract" section EXACTLY so checkpoint 08 is a provider swap,
//      not a refactor:
//        POST /chat/messages { content }
//          → 200 { userMessage, assistantMessage }   (both ChatMessageResponse)
//        GET  /chat/messages?cursor=&limit=
//          → 200 { items, nextCursor }                (CreatedAt DESC, Id DESC)
//        ChatMessageResponse(Id, Role, Content, CreatedAt,
//                            SuggestedRecipes: List<RecipeResponse>)
//      One continuous thread per user (no conversation ids in v1).
//   2. The active provider — a single exported `chatApi`. At checkpoint 07 it
//      is the mock; checkpoint 08 flips the ONE marked line to the real client.
//      Nothing outside this file knows which implementation is active.
// ─────────────────────────────────────────────────────────────────────────

import type { RecipeResponse } from './types'
import { createMockChatApi } from './chat.mock'

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

/** POST /chat/messages → 200 body. */
export interface SendMessageResponse {
  userMessage: ChatMessageResponse
  assistantMessage: ChatMessageResponse
}

/** GET /chat/messages query params. cursor is the opaque base64url keyset token. */
export interface GetMessagesParams {
  cursor?: string | null
  /** default 20, capped at 50 by the backend. */
  limit?: number
}

/** GET /chat/messages → 200 body. Ordered CreatedAt DESC, Id DESC (newest first). */
export interface GetMessagesResponse {
  items: ChatMessageResponse[]
  /** null on the last (oldest) page. */
  nextCursor: string | null
}

/**
 * The one seam every chat data call goes through. The real implementation
 * (checkpoint 08) will route these through the frozen `apiFetch` wrapper; the
 * mock (checkpoint 07) serves canned replies + real-or-fixture suggestions.
 */
export interface ChatApi {
  /** POST /chat/messages — persist the user turn, get the assistant's reply. */
  sendMessage(content: string, signal?: AbortSignal): Promise<SendMessageResponse>
  /** GET /chat/messages — one page of history, newest first; page OLDER via nextCursor. */
  getMessages(params?: GetMessagesParams, signal?: AbortSignal): Promise<GetMessagesResponse>
}

// ── Active provider ─────────────────────────────────────────────────────────
// CHECKPOINT 08 SWAP POINT: change this ONE line to the real client
// (`createRealChatApi()`), and nothing else in the app moves. The mock stays
// behind `createMockChatApi` for tests (MSW).
export const chatApi: ChatApi = createMockChatApi()
