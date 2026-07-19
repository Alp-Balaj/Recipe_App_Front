import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { useChatApi } from './ChatApiContext'
import type { ConversationSummary } from '@/api/chat'

const CONVERSATIONS_PAGE = 20

/**
 * The caller's conversation list (chat-ai v3), keyset-paged newest-active first.
 * Shared by ChatPage (active-thread title, new-chat detection) and the
 * ConversationDrawer (the switch/rename/delete list). One query key means one
 * cache both surfaces read — a rename/delete/new-turn invalidates it once.
 */
export function useConversations() {
  const api = useChatApi()
  return useInfiniteQuery({
    queryKey: queryKeys.chat.conversations(),
    queryFn: ({ pageParam }) => api.listConversations({ cursor: pageParam, limit: CONVERSATIONS_PAGE }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

/** Flatten the paged conversation list into a single newest-active-first array. */
export function flattenConversations(
  pages: { items: ConversationSummary[] }[] | undefined,
): ConversationSummary[] {
  return pages ? pages.flatMap((p) => p.items) : []
}
