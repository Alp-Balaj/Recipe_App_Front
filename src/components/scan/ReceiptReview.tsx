// ─────────────────────────────────────────────────────────────────────────
// Step 2 of the receipt flow — "Review" (Scan redesign).
//
// What this replaces: a checkbox per line under "untick anything you don't
// want". Everything on a receipt is something you actually bought, so ticked-
// by-default was right — but a checkbox invites reading twelve rows and
// deciding twelve times. Swiping is the honest shape of the real job: keep
// everything, flick away the loyalty-stamp noise.
//
// A destructive gesture needs a way back, so removal is NOT a delete: the line
// is marked excluded (the same `kept: boolean[]` the checkboxes drove) and a
// snackbar offers Undo. Nothing is lost until Confirm, and Confirm is the only
// thing that writes.
//
// The gesture is not the only path. Behind each card sits a real Remove button:
// it is what the swipe uncovers, and it is also what Tab reaches — the card
// slides aside when that button takes focus, so a keyboard user sees the same
// affordance a thumb does.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ReceiptItem } from '@/api/scan'

/** How far a card slides to uncover Remove, and how far a swipe must go. */
const REVEAL = 76
const COMMIT = 46

interface ReceiptReviewProps {
  items: ReceiptItem[]
  /** Index-aligned with `items`; false = swiped away, still recoverable. */
  kept: boolean[]
  onSetKept: (index: number, keep: boolean) => void
  onConfirm: () => void
  disabled: boolean
}

export default function ReceiptReview({ items, kept, onSetKept, onConfirm, disabled }: ReceiptReviewProps) {
  const [undoIndex, setUndoIndex] = useState<number | null>(null)

  // The snackbar is a safety net, not a permanent control — it stands down once
  // the moment it belongs to has passed.
  useEffect(() => {
    if (undoIndex === null) return
    const timer = setTimeout(() => setUndoIndex(null), 6000)
    return () => clearTimeout(timer)
  }, [undoIndex])

  if (items.length === 0) {
    return (
      <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 18, lineHeight: 1.55 }}>
        We couldn’t read any purchases off that photo. Try a flatter, brighter shot of the receipt.
      </div>
    )
  }

  const keptCount = kept.filter(Boolean).length
  const visible = items.map((item, i) => ({ item, i })).filter(({ i }) => kept[i] !== false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 10 }}>
        {items.length} line{items.length === 1 ? '' : 's'} read — swipe away the noise
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(({ item, i }) => (
          <LineCard
            key={`${item.name}-${i}`}
            item={item}
            disabled={disabled}
            onRemove={() => {
              onSetKept(i, false)
              setUndoIndex(i)
            }}
          />
        ))}
      </div>

      {undoIndex !== null && (
        <div role="status" style={snackbar}>
          <span style={{ flex: 1, minWidth: 0 }}>Removed “{items[undoIndex].name}”</span>
          <button
            type="button"
            onClick={() => {
              onSetKept(undoIndex, true)
              setUndoIndex(null)
            }}
            style={undoBtn}
          >
            Undo
          </button>
        </div>
      )}

      <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', paddingTop: 12, marginTop: 4 }}>
        <button
          type="button"
          disabled={keptCount === 0 || disabled}
          onClick={onConfirm}
          style={{
            ...confirmBtn,
            cursor: keptCount === 0 || disabled ? 'default' : 'pointer',
            opacity: keptCount === 0 || disabled ? 0.55 : 1,
          }}
        >
          Add {keptCount} to this week’s list
        </button>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted)', margin: '8px 0 4px' }}>
          Swiped lines can be brought back with undo
        </div>
      </div>
    </div>
  )
}

/** One draft line: a card that slides left over a clay "Remove" action. */
function LineCard({
  item,
  onRemove,
  disabled,
}: {
  item: ReceiptItem
  onRemove: () => void
  disabled: boolean
}) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef<number | null>(null)

  const settle = () => {
    if (offset <= -COMMIT) onRemove()
    else setOffset(0)
    startX.current = null
    setDragging(false)
  }

  return (
    <div style={{ position: 'relative', borderRadius: 14, background: 'var(--clay)', overflow: 'hidden' }}>
      {/* Uncovered by the swipe; reached directly by Tab. */}
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${item.name}`}
        onFocus={() => setOffset(-REVEAL)}
        onBlur={() => setOffset(0)}
        style={removeAction}
      >
        Remove
      </button>

      <div
        onPointerDown={(e) => {
          if (disabled) return
          startX.current = e.clientX
          setDragging(true)
          e.currentTarget.setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (startX.current === null) return
          setOffset(Math.max(-REVEAL, Math.min(0, e.clientX - startX.current)))
        }}
        onPointerUp={settle}
        onPointerCancel={settle}
        style={{
          ...lineCard,
          transform: `translateX(${offset}px)`,
          // No easing mid-drag — the card should track the thumb, not lag it.
          transition: dragging ? undefined : 'transform 160ms ease-out',
        }}
      >
        <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{item.name}</span>
        {item.quantity && <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{item.quantity}</span>}
      </div>
    </div>
  )
}

const lineCard: CSSProperties = {
  position: 'relative',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '12px 14px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 13.5,
  // Vertical scrolling still belongs to the page; only the horizontal axis is ours.
  touchAction: 'pan-y',
}

const removeAction: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  paddingRight: 16,
  paddingLeft: 16,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
}

const snackbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginTop: 12,
  borderRadius: 12,
  padding: '10px 12px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  fontSize: 12.5,
  color: 'var(--text)',
}

const undoBtn: CSSProperties = {
  flexShrink: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 800,
  color: 'var(--accent)',
  padding: 0,
}

const confirmBtn: CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: 12,
  padding: '12px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}
