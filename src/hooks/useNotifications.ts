// ─────────────────────────────────────────────────────────────────────────
// Notifications (open-loops slice 3).
//
// Polling, not websockets: a keyset cursor and an interval reuse pagination
// machinery that is already built and tested, and at this scale a socket buys
// nothing but a connection to keep alive. The horizon document parks realtime
// deliberately.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
  type NotificationListResponse,
} from '@/api/notifications'
import { useAuth } from '@/auth/AuthContext'

/** Rows per page. Generous — notification lines are one row each. */
export const NOTIFICATIONS_PAGE_SIZE = 20

/** How often the bell asks. Slow enough to be cheap, fast enough to feel live. */
export const UNREAD_POLL_MS = 60_000

/**
 * The badge count. Disabled for guests — the endpoint is authenticated, so
 * polling it signed-out would be a 401 every minute.
 */
export function useUnreadCount() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: ({ signal }) => getUnreadCount(signal),
    enabled: !!user,
    refetchInterval: UNREAD_POLL_MS,
    // A failed poll must never surface as an error state — the bell just keeps
    // showing the last count it knew.
    retry: false,
  })
}

/** The keyset-paged list behind /notifications. */
export function useNotifications() {
  const { user } = useAuth()
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: ({ pageParam, signal }) =>
      getNotifications({ cursor: pageParam, limit: NOTIFICATIONS_PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: NotificationListResponse) => last.nextCursor ?? undefined,
    enabled: !!user,
  })
}

/**
 * Mark everything up to a timestamp as read. Invalidates the whole notification
 * subtree on success rather than patching: the server owns ReadAt, the count is
 * derived from it, and this fires once per page visit — not per keystroke.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (upTo: string) => markNotificationsRead(upTo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}
