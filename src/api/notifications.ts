// ─────────────────────────────────────────────────────────────────────────
// Notifications (open-loops slice 3) — NEW module, following the api/social.ts
// precedent. Wire contract:
//
//   GET /notifications?cursor&limit → 200 NotificationListResponse
//       { items: NotificationResponse[], nextCursor?: string|null, unreadCount: number }
//       400 on a malformed cursor or a non-positive limit. Authenticated only.
//   GET /notifications/unread-count  → 200 { unreadCount: number }
//   PUT /notifications/read          → 204. Body { upTo: ISO-8601 UTC }.
//       400 if upTo is not UTC. Idempotent — already-read rows keep their ReadAt.
//
// All three are caller-scoped: there is no "someone else's notifications" read.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { UserSummaryResponse } from './social'

/**
 * Mirrors the backend NotificationType enum. A union rather than an enum, per
 * the api/types.ts convention for PascalCase wire enums.
 */
export type NotificationType = 'RecipeLiked' | 'RecipeCommented' | 'CommentLiked' | 'UserFollowed'

/**
 * recipeTitle is null when the notification has no recipe context (a follow) OR
 * when the recipe has since been soft-deleted — the event still happened, so the
 * row survives with nothing to link to.
 */
export interface NotificationResponse {
  id: string
  type: NotificationType
  actor: UserSummaryResponse
  recipeId?: string | null
  recipeTitle?: string | null
  commentId?: string | null
  createdAt: string
  readAt?: string | null
}

export interface NotificationListResponse {
  items: NotificationResponse[]
  nextCursor?: string | null
  unreadCount: number
}

export interface UnreadCountResponse {
  unreadCount: number
}

/** GET /notifications — one keyset page, newest first. */
export function getNotifications(params: {
  cursor?: string
  limit?: number
  signal?: AbortSignal
}): Promise<NotificationListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<NotificationListResponse>('/notifications', { query: { cursor, limit }, signal })
}

/** GET /notifications/unread-count — what the bell polls. */
export function getUnreadCount(signal?: AbortSignal): Promise<UnreadCountResponse> {
  return apiFetch<UnreadCountResponse>('/notifications/unread-count', { signal })
}

/** PUT /notifications/read → 204. `upTo` must be an ISO-8601 UTC timestamp. */
export function markNotificationsRead(upTo: string): Promise<void> {
  return apiFetch<void>('/notifications/read', { method: 'PUT', body: { upTo } })
}
