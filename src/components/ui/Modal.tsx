// ─────────────────────────────────────────────────────────────────────────
// The one modal/dialog primitive (fe · consolidation).
//
// Before: MyRecipesPage's Overlay (a click-catching div with NO role, NO focus
// trap, NO Escape, NO focus restore) and RecipeDetailPage's CookMode (had
// role="dialog" + aria-label but no aria-modal / trap / Escape / restore).
//
// Now: one <Modal> with real dialog semantics —
//   • role="dialog" + aria-modal="true" on the panel
//   • focus moves into the panel on open, restores to the trigger on close
//   • Escape closes; Tab / Shift+Tab is trapped within the panel
//   • backdrop click closes (dimmed variants only)
//
// Layout is picked by `variant`: "center" (a small centered card, e.g. a
// confirm), "sheet" (a full-width top-aligned scroll sheet, e.g. the edit
// form), "full" (an opaque full-bleed panel, e.g. cook mode).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type ModalVariant = 'center' | 'sheet' | 'full'

interface ModalProps {
  onClose: () => void
  /** Accessible name for the dialog (used when there's no visible titled element). */
  label: string
  variant?: ModalVariant
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ onClose, label, variant = 'center', children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Move focus into the dialog on open; restore it to the trigger on close.
  // The trigger must be captured during render, not in the effect: React applies
  // a child's autoFocus at commit, so by effect time the active element can
  // already be a field INSIDE the panel (e.g. the edit form's Title).
  const [trigger] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(() => {
    const panel = panelRef.current
    // Respect an autofocused field inside the panel (e.g. the form's Title); only
    // pull focus in if it isn't already there.
    if (panel && !panel.contains(document.activeElement)) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panel).focus()
    }
    return () => trigger?.focus?.()
  }, [trigger])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === panel,
    )
    if (items.length === 0) {
      e.preventDefault()
      panel.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const dimmed = variant !== 'full'
  const onBackdropClick = (e: React.MouseEvent) => {
    // Only a click on the backdrop itself (not bubbled from the panel) closes.
    if (dimmed && e.target === e.currentTarget) onClose()
  }

  return (
    <div style={backdropStyle(variant)} onClick={onBackdropClick} onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="scroll"
        style={panelStyle(variant)}
      >
        {children}
      </div>
    </div>
  )
}

function backdropStyle(variant: ModalVariant): CSSProperties {
  const base: CSSProperties = { position: 'absolute', inset: 0, zIndex: variant === 'full' ? 20 : 10 }
  if (variant === 'full') return base
  return {
    ...base,
    background: 'var(--backdrop)',
    display: 'flex',
    alignItems: variant === 'center' ? 'center' : 'flex-start',
    justifyContent: 'center',
    padding: variant === 'center' ? 18 : 0,
    overflowY: 'auto',
  }
}

function panelStyle(variant: ModalVariant): CSSProperties {
  if (variant === 'center') return { width: '100%', maxWidth: 380, outline: 'none' }
  if (variant === 'sheet')
    return { width: '100%', minHeight: '100%', background: 'var(--bg)', padding: '46px 18px 24px', outline: 'none' }
  // full
  return {
    position: 'absolute',
    inset: 0,
    background: 'var(--bg)',
    display: 'flex',
    flexDirection: 'column',
    padding: '54px 22px 22px',
    outline: 'none',
  }
}
