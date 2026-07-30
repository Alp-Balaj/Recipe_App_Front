// ─────────────────────────────────────────────────────────────────────────
// stream D (governor) — the user-facing report endpoint.
//
// Wire contract (verified against Recipe_App_Back stream/d-governor):
//   POST /reports  body { targetType, targetId, reason, details? }
//     200 → ReportResponse (status "Open", targetSummary snapshot)
//     400 → ValidationProblem — bad body, or reporting your OWN content
//     404 → target missing or not visible to the reporter (never distinguishes)
//     409 → the caller already has an OPEN report on this target
//     401 → no session
// Enums ride as PascalCase strings (global JsonStringEnumConverter).
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

export type ReportTargetType = 'Recipe' | 'Comment' | 'User'
export type ReportReason = 'Spam' | 'Inappropriate' | 'Harassment' | 'Misinformation' | 'Other'
export type ReportStatus = 'Open' | 'Resolved' | 'Dismissed'

export interface CreateReportRequest {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details?: string | null
}

export interface ReportReporter {
  id: string
  username: string
  profileImageUrl?: string | null
}

export interface ReportResponse {
  id: string
  targetType: ReportTargetType
  /** Null once a removed comment's FK nulls out — targetSummary stays readable. */
  targetId?: string | null
  targetSummary: string
  reason: ReportReason
  details?: string | null
  status: ReportStatus
  createdAt: string
  reporter: ReportReporter
  resolvedAtUtc?: string | null
  resolvedByUsername?: string | null
  resolutionNote?: string | null
}

/** The selectable reasons, in display order, with the labels the UI shows. */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'Spam', label: 'Spam or advertising' },
  { value: 'Inappropriate', label: 'Inappropriate content' },
  { value: 'Harassment', label: 'Harassment or hate' },
  { value: 'Misinformation', label: 'Dangerous misinformation' },
  { value: 'Other', label: 'Something else' },
]

export function submitReport(body: CreateReportRequest): Promise<ReportResponse> {
  return apiFetch<ReportResponse>('/reports', { method: 'POST', body })
}
