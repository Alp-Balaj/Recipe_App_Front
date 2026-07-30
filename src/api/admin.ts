// ─────────────────────────────────────────────────────────────────────────
// stream D (governor) — the admin surface's API module. Every route below sits
// behind the backend's AdminOnly policy: an authenticated non-admin gets 403,
// which the UI surfaces as a full-page denial rather than hiding the failure.
//
// Wire contract (verified against Recipe_App_Back stream/d-governor):
//   GET  /admin/overview                    → AdminOverviewResponse
//   GET  /admin/reports?status&cursor&limit → AdminReportListResponse (keyset)
//   POST /admin/reports/{id}/resolve        body { note? }   200 | 404 | 409 (already triaged)
//   POST /admin/reports/{id}/dismiss        body { note? }   200 | 404 | 409
//   GET  /admin/recipes/{id}                → AdminRecipeResponse (sees private + hidden)
//   POST /admin/recipes/{id}/hide           body { reason? } 204 | 404 | 409 (already hidden)
//   POST /admin/recipes/{id}/restore        body { reason? } 204 | 404 | 409 (not hidden)
//   GET  /admin/comments/{id}               → AdminCommentResponse
//   POST /admin/comments/{id}/remove        body { reason? } 204 | 404 (hard delete)
//   GET  /admin/users/{id}                  → AdminUserResponse
//   POST /admin/users/{id}/suspend          body { days, reason? } 204 | 403 (target is admin) | 404
//   POST /admin/users/{id}/unsuspend        204 | 404 | 409 (not suspended)
//   POST /admin/users/{id}/ban              body { reason? } 204 | 403 | 404 | 409 (already banned)
//   POST /admin/users/{id}/unban            204 | 404 | 409 (not banned)
//   GET  /admin/audit?cursor&limit          → AdminAuditListResponse (append-only, newest first)
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { UserRole } from './types'
import type { ReportResponse, ReportStatus } from './reports'

export interface AdminOverviewResponse {
  totalUsers: number
  totalRecipes: number
  openReports: number
}

export interface AdminReportListResponse {
  items: ReportResponse[]
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

export function getAdminAudit(params: { cursor?: string; limit?: number } = {}): Promise<AdminAuditListResponse> {
  return apiFetch<AdminAuditListResponse>('/admin/audit', {
    query: { cursor: params.cursor, limit: params.limit },
  })
}
