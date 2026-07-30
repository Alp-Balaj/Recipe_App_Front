// ─────────────────────────────────────────────────────────────────────────
// stream D (governor) — the one report dialog, shared by the recipe detail
// page and the comment rows. A centered Modal card: closed reason list,
// optional details, one submit. Errors surface inline per the CommentsPanel
// convention (instanceof-checked, human sentences).
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useMutation } from '@tanstack/react-query'
import Modal from '@/components/ui/Modal'
import {
  REPORT_REASONS,
  submitReport,
  type ReportReason,
  type ReportTargetType,
} from '@/api/reports'
import { ApiConflictError, ApiError, ApiValidationError } from '@/api/client'

interface ReportModalProps {
  targetType: ReportTargetType
  targetId: string
  /** Short human label of what's being reported — "this recipe", "sam's comment". */
  targetLabel: string
  onClose: () => void
}

function reportErrorMessage(error: unknown): string {
  if (error instanceof ApiConflictError) return 'You already have an open report on this.'
  if (error instanceof ApiValidationError) return 'You can’t report your own content.'
  if (error instanceof ApiError && error.status === 404) return 'This content is no longer available.'
  return 'Could not send the report. Please try again.'
}

export default function ReportModal({ targetType, targetId, targetLabel, onClose }: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason>('Spam')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<string | null>(null)

  const report = useMutation({
    mutationFn: () =>
      submitReport({ targetType, targetId, reason, details: details.trim() || null }),
    onError: (err) => setError(reportErrorMessage(err)),
  })

  const sent = report.isSuccess

  return (
    <Modal variant="center" label={`Report ${targetLabel}`} onClose={onClose}>
      <div style={card}>
        {sent ? (
          <>
            <div style={title}>Report sent</div>
            <div style={body}>
              Thanks — an admin will review {targetLabel}. You won't be notified, but action
              is logged.
            </div>
            <button onClick={onClose} style={primaryBtn}>
              Done
            </button>
          </>
        ) : (
          <>
            <div style={title}>Report {targetLabel}?</div>
            <div style={body}>Pick the reason that fits best. Admins see a snapshot of the content.</div>

            <div role="radiogroup" aria-label="Reason" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {REPORT_REASONS.map((r) => (
                <label key={r.value} style={reasonRow(reason === r.value)}>
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 13.5, fontWeight: reason === r.value ? 700 : 500 }}>{r.label}</span>
                </label>
              ))}
            </div>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything an admin should know (optional)"
              rows={3}
              maxLength={1000}
              aria-label="Report details"
              style={detailsArea}
            />

            {error && (
              <div role="alert" style={alert}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button
                onClick={() => {
                  setError(null)
                  report.mutate()
                }}
                disabled={report.isPending}
                style={{ ...primaryBtn, flex: 1, opacity: report.isPending ? 0.6 : 1 }}
              >
                {report.isPending ? 'Sending…' : 'Send report'}
              </button>
              <button onClick={onClose} style={cancelBtn}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '20px 18px',
}

const title: CSSProperties = { fontSize: 17, fontWeight: 800, marginBottom: 6 }

const body: CSSProperties = {
  fontSize: 13.5,
  color: 'var(--muted)',
  lineHeight: 1.5,
  marginBottom: 14,
}

const reasonRow = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '8px 10px',
  borderRadius: 11,
  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
  background: selected ? 'var(--accent-soft)' : 'var(--surface2)',
  cursor: 'pointer',
})

const detailsArea: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--inputbg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--text)',
  resize: 'vertical',
}

const alert: CSSProperties = {
  marginTop: 10,
  fontSize: 13,
  color: 'var(--clay)',
  fontWeight: 600,
}

const primaryBtn: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 13,
  padding: '11px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
}

const cancelBtn: CSSProperties = {
  padding: '11px 18px',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--muted)',
}
