// ─────────────────────────────────────────────────────────────────────────
// Admin Rework (stream W0-FE, Task 6) — shared plumbing for the tabbed admin
// section. Every constant and hook below was moved (not copied) out of the
// old single-page AdminPage.tsx so the six tab/page files that replace it
// (AdminLayout + one file per Wave-1 stream) share one error-message
// vocabulary, one mutation shape, and one set of styles instead of each
// re-deriving its own.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, ApiConflictError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'

export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiConflictError) {
    return 'Already in that state — someone (maybe you) got there first. Refreshing.'
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'That account is an admin — not moderatable from here.'
  }
  if (error instanceof ApiError && error.status === 404) {
    return 'That target no longer exists.'
  }
  return 'The action failed. Try again.'
}

export function describeAction(action: string): string {
  switch (action) {
    case 'ReportResolved': return 'resolved a report'
    case 'ReportDismissed': return 'dismissed a report'
    case 'RecipeHidden': return 'hid a recipe'
    case 'RecipeRestored': return 'restored a recipe'
    case 'CommentRemoved': return 'removed a comment'
    case 'UserSuspended': return 'suspended a user'
    case 'UserUnsuspended': return 'lifted a suspension'
    case 'UserBanned': return 'banned a user'
    case 'UserUnbanned': return 'unbanned a user'
    // Admin Rework additions (spec §5.4).
    case 'AdminPromoted': return 'promoted to admin'
    case 'AdminDemoted': return 'demoted to user'
    default: return action
  }
}

/**
 * Every admin action — the queue's triage buttons, and every Wave-1 tab's
 * mutations alike — shares this shape: run an arbitrary admin call,
 * invalidate the admin subtree (plus the catalogue/feed caches an action can
 * affect) on success, and surface a friendly message on failure, refetching
 * on a 409 because that means the cached state is already stale. Extracted
 * verbatim from today's AdminPage's `act` mutation so every tab gets the
 * same behavior without re-deriving it.
 */
export function useAdminMutation() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.feed.all })
    },
    onError: (err) => {
      setError(adminErrorMessage(err))
      // A 409 means the cached state is stale — refetch so the queue/tab tells the truth.
      if (err instanceof ApiConflictError) {
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all })
      }
    },
  })

  return {
    mutate: (fn: () => Promise<unknown>) => mutation.mutate(fn),
    isPending: mutation.isPending,
    error,
    clearError: () => setError(null),
  }
}

export function CountTile({ label, value, accent }: { label: string; value?: number; accent?: boolean }) {
  return (
    <div style={countTile}>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          marginTop: 4,
          color: accent ? 'var(--accent)' : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value ?? '—'}
      </div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

export const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

export const countsRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 10,
  marginBottom: 16,
}

const countTile: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '12px 14px',
}

export const scopeTab: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 11,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--muted)',
  textDecoration: 'none',
  display: 'inline-block',
}

export const scopeTabOn: CSSProperties = {
  ...scopeTab,
  border: '1px solid transparent',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

export const listCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '4px 14px',
}

export const auditRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 6,
  flexWrap: 'wrap',
  fontSize: 12.5,
  padding: '8px 0',
  borderBottom: '1px solid var(--border)',
}

export const mutedNote: CSSProperties = { fontSize: 13, color: 'var(--muted)', padding: '10px 0' }

export const alertStyle: CSSProperties = {
  fontSize: 12.5,
  color: '#d9534f',
  fontWeight: 600,
  marginBottom: 10,
}

export const linkBtn: CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  padding: 0,
}
