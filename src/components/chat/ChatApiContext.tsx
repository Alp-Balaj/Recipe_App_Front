import { createContext, useContext } from 'react'
import { chatApi, type ChatApi } from '@/api/chat'

/**
 * The active ChatApi, injectable via context. Production never provides it —
 * the default IS the app-wide singleton from chat.ts (mock at checkpoint 07,
 * real at 08), so "nothing outside chat.ts knows which impl is active" holds.
 * Tests inject a fresh mock per case for isolation.
 */
const ChatApiContext = createContext<ChatApi>(chatApi)

export const ChatApiProvider = ChatApiContext.Provider

export function useChatApi(): ChatApi {
  return useContext(ChatApiContext)
}
