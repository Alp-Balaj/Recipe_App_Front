// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream W0-FE) — the admin surface's API module. Every route
// below sits behind the backend's AdminOnly policy: an authenticated
// non-admin gets 403, which the UI surfaces as a full-page denial rather
// than hiding the failure.
//
// Wire contract (spec §5, cross-checked against the Admin Rework plan):
//   GET  /admin/overview                    → AdminOverviewResponse (counts + AI-today)
//   GET  /admin/users?search&status&sort&page&pageSize → AdminUserListResponse (offset-paged, §5.2)
//   GET  /admin/users/{id}                  → AdminUserResponse
//   GET  /admin/users/{id}/usage            → AdminUserUsageResponse | 404
//   POST /admin/users/{id}/suspend          body { days, reason? } 204 | 403 (target is admin) | 404
//   POST /admin/users/{id}/unsuspend        204 | 404 | 409 (not suspended)
//   POST /admin/users/{id}/ban              body { reason? } 204 | 403 | 404 | 409 (already banned)
//   POST /admin/users/{id}/unban            204 | 404 | 409 (not banned)
//   POST /admin/users/{id}/promote          204 | 403 (self) | 404 | 409 (already admin/banned)
//   POST /admin/users/{id}/demote           204 | 403 (self) | 404 | 409 (not admin)
//   GET  /admin/reports?status&cursor&limit → AdminReportListResponse (keyset, wrapped items §5.5)
//   POST /admin/reports/{id}/resolve        body { note? }   200 | 404 | 409 (already triaged)
//   POST /admin/reports/{id}/dismiss        body { note? }   200 | 404 | 409
//   GET  /admin/recipes/{id}                → AdminRecipeResponse (sees private + hidden)
//   POST /admin/recipes/{id}/hide           body { reason? } 204 | 404 | 409 (already hidden)
//   POST /admin/recipes/{id}/restore        body { reason? } 204 | 404 | 409 (not hidden)
//   GET  /admin/comments/{id}               → AdminCommentResponse
//   POST /admin/comments/{id}/remove        body { reason? } 204 | 404 (hard delete)
//   GET  /admin/events?category&cursor&limit → AdminEventListResponse (keyset, §5.6; 400 on bad category)
//   GET  /admin/audit?cursor&limit          → AdminAuditListResponse (append-only, newest first)
// ──────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { UserRole } from './types'
import type { ReportResponse, ReportStatus } from './reports'

export interface AdminOverviewResponse {
  users: { total: number; banned: number; suspended: number; admins: number }
  recipes: { total: number; hidden: number }
  comments: { total: number }
  reports: { open: number; resolved: number; dismissed: number }
  aiToday: {
    calls: number
    tokens: number
    byLane: { lane: string; calls: number; tokens: number }[]
    topUsers: { userId: string; username: string; tokens: number }[]
  }
}

export type AdminUserStatusFilter = 'all' | 'banned' | 'suspended' | 'admins'
export type AdminUserSort = 'newest' | 'tokens'

export interface AdminUserListItem {
  id: string
  username: string
  email: string
  role: UserRole
  isBanned: boolean
  suspendedUntilUtc?: string | null
  createdAt: string
  allTimeTokens: number
}

export interface AdminUserListResponse {
  items: AdminUserListItem[]
  page: number
  totalPages: number
  totalCount: number
}

export interface AdminUserUsageResponse {
  todayCalls: number
  todayTokens: number
  allTimeTokens: number
  budget: { callsRemaining: number; tokensRemaining: number; resetsAtUtc: string }
}

export type AppEventCategory = 'Ai' | 'Content' | 'Account'
// Mirrors RecipeApp.Domain.Enums.AppEventType member-for-member. A member added
// there and not here renders as `undefined` in the events feed — describeEvent's
// switch simply falls off the end — so the two move together. KAN-19 added the
// last three; all fall into the Account category server-side.
export type AppEventType =
  | 'AiCallFailed' | 'RecipeCreated' | 'RecipeDeleted' | 'CommentCreated'
  | 'ReportFiled' | 'UserRegistered' | 'UserLoginFailed'
  | 'EmailVerified' | 'PasswordReset' | 'MailSendFailed'

export interface AdminEventEntry {
  id: string
  category: AppEventCategory
  type: AppEventType
  actorUsername?: string | null
  targetId?: string | null
  detail?: string | null
  createdAt: string
}

export interface AdminEventListResponse {
  items: AdminEventEntry[]
  nextCursor?: string | null
}

// Reports gain triage context (spec §5.5): the queue now returns wrapped items.
export interface AdminReportListItem {
  report: ReportResponse
  reporter: { id: string; username: string }
  // Null once the reported content's row is gone — removing a reported comment nulls the
  // report's only target FK, so the server has no author left to name. The report itself
  // survives on report.targetSummary, the snapshot taken when it was filed.
  targetAuthor: { id: string; username: string; totalReportsAgainst: number } | null
}

export interface AdminReportListResponse {
  items: AdminReportListItem[]
  nextCursor?: string | null
}

export interface AdminRecipeResponse {
  id: string
  title: string
  description: string
  visibility: 'Public' | 'Private' | 'FriendsOnly'
  isDeleted: boolean
  deletedAt?: string | null
  createdAt: string
  author: { id: string; username: string; profileImageUrl?: string | null }
}

export interface AdminCommentResponse {
  id: string
  content: string
  createdAt: string
  recipeId: string
  author: { id: string; username: string; profileImageUrl?: string | null }
}

export interface AdminUserResponse {
  id: string
  username: string
  email: string
  role: UserRole
  isBanned: boolean
  suspendedUntilUtc?: string | null
  createdAt: string
  recipeCount: number
  openReportsAgainst: number
}

export type AuditAction =
  | 'ReportResolved'
  | 'ReportDismissed'
  | 'RecipeHidden'
  | 'RecipeRestored'
  | 'CommentRemoved'
  | 'UserSuspended'
  | 'UserUnsuspended'
  | 'UserBanned'
  | 'UserUnbanned'
  | 'AdminPromoted'
  | 'AdminDemoted'

export interface AdminAuditEntry {
  id: string
  actorUsername: string
  action: AuditAction
  targetId: string
  detail?: string | null
  createdAt: string
}

export interface AdminAuditListResponse {
  items: AdminAuditEntry[]
  nextCursor?: string | null
}

export function getAdminOverview(): Promise<AdminOverviewResponse> {
  return apiFetch<AdminOverviewResponse>('/admin/overview')
}

export function getAdminReports(params: {
  status?: ReportStatus
  cursor?: string
  limit?: number
}): Promise<AdminReportListResponse> {
  return apiFetch<AdminReportListResponse>('/admin/reports', {
    query: { status: params.status, cursor: params.cursor, limit: params.limit },
  })
}

export function resolveReport(reportId: string, note?: string): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(`/admin/reports/${reportId}/resolve`, {
    method: 'POST',
    body: { note: note ?? null },
  })
}

export function dismissReport(reportId: string, note?: string): Promise<ReportResponse> {
  return apiFetch<ReportResponse>(`/admin/reports/${reportId}/dismiss`, {
    method: 'POST',
    body: { note: note ?? null },
  })
}

export function getAdminRecipe(recipeId: string): Promise<AdminRecipeResponse> {
  return apiFetch<AdminRecipeResponse>(`/admin/recipes/${recipeId}`)
}

export function hideRecipe(recipeId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/recipes/${recipeId}/hide`, { method: 'POST', body: { reason: reason ?? null } })
}

export function restoreRecipe(recipeId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/recipes/${recipeId}/restore`, { method: 'POST', body: { reason: reason ?? null } })
}

export function getAdminComment(commentId: string): Promise<AdminCommentResponse> {
  return apiFetch<AdminCommentResponse>(`/admin/comments/${commentId}`)
}

export function removeComment(commentId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/comments/${commentId}/remove`, { method: 'POST', body: { reason: reason ?? null } })
}

export function getAdminUser(userId: string): Promise<AdminUserResponse> {
  return apiFetch<AdminUserResponse>(`/admin/users/${userId}`)
}

export function suspendUser(userId: string, days: number, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/suspend`, { method: 'POST', body: { days, reason: reason ?? null } })
}

export function unsuspendUser(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/unsuspend`, { method: 'POST' })
}

export function banUser(userId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/ban`, { method: 'POST', body: { reason: reason ?? null } })
}

export function unbanUser(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/unban`, { method: 'POST' })
}

export function getAdminUsers(params: {
  search?: string
  status?: AdminUserStatusFilter
  sort?: AdminUserSort
  page?: number
  pageSize?: number
}): Promise<AdminUserListResponse> {
  return apiFetch<AdminUserListResponse>('/admin/users', {
    query: { search: params.search, status: params.status, sort: params.sort, page: params.page, pageSize: params.pageSize },
  })
}

export function getAdminUserUsage(userId: string): Promise<AdminUserUsageResponse> {
  return apiFetch<AdminUserUsageResponse>(`/admin/users/${userId}/usage`)
}

export function promoteUser(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/promote`, { method: 'POST' })
}

export function demoteUser(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/demote`, { method: 'POST' })
}

export function getAdminEvents(params: {
  category?: AppEventCategory
  cursor?: string
  limit?: number
} = {}): Promise<AdminEventListResponse> {
  return apiFetch<AdminEventListResponse>('/admin/events', {
    query: { category: params.category, cursor: params.cursor, limit: params.limit },
  })
}

export function getAdminAudit(params: { cursor?: string; limit?: number } = {}): Promise<AdminAuditListResponse> {
  return apiFetch<AdminAuditListResponse>('/admin/audit', {
    query: { cursor: params.cursor, limit: params.limit },
  })
}
