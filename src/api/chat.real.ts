// ─────────────────────────────────────────────────────────────────────────
// Real ChatApi (chat-ai v3). A thin, STATELESS mapping of the conversation-
// aware `ChatApi` onto the backend's /chat/conversations surface. The UI owns
// the active conversation id (from the /chat/:conversationId URL), so this
// client holds no state of its own — every method takes what it needs.
//
// New module (not one of the frozen shared modules). Owned by lane C. Routes
// every call through the frozen `apiFetch` wrapper (prefixes /api, attaches the
// bearer, throws typed errors — a 502 AssistantUnavailable surfaces as ApiError,
// which the UI's existing error handling already exercises).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type {
  ChatApi,
  ConversationListResponse,
  ConversationSummary,
  GetMessagesResponse,
  PageParams,
  SendMessageResponse,
  StartConversationResponse,
} from './chat'

export function createRealChatApi(): ChatApi {
  return {
    listConversations(params: PageParams = {}, signal?: AbortSignal): Promise<ConversationListResponse> {
      return apiFetch<ConversationListResponse>('/chat/conversations', {
        query: { cursor: params.cursor, limit: params.limit },
        signal,
      })
    },

    startConversation(content: string, signal?: AbortSignal): Promise<StartConversationResponse> {
      return apiFetch<StartConversationResponse>('/chat/conversations', {
        method: 'POST',
        body: { content },
        signal,
      })
    },

    renameConversation(conversationId: string, title: string, signal?: AbortSignal): Promise<ConversationSummary> {
      return apiFetch<ConversationSummary>(`/chat/conversations/${conversationId}`, {
        method: 'PATCH',
        body: { title },
        signal,
      })
    },

    async deleteConversation(conversationId: string, signal?: AbortSignal): Promise<void> {
      // 204 No Content → apiFetch resolves undefined; swallow it for the void contract.
      await apiFetch<void>(`/chat/conversations/${conversationId}`, {
        method: 'DELETE',
        signal,
      })
    },

    sendMessage(conversationId: string, content: string, signal?: AbortSignal): Promise<SendMessageResponse> {
      return apiFetch<SendMessageResponse>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { content },
        signal,
      })
    },

    getMessages(conversationId: string, params: PageParams = {}, signal?: AbortSignal): Promise<GetMessagesResponse> {
      return apiFetch<GetMessagesResponse>(`/chat/conversations/${conversationId}/messages`, {
        query: { cursor: params.cursor, limit: params.limit },
        signal,
      })
    },
  }
}
