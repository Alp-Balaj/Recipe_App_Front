// ─────────────────────────────────────────────────────────────────────────
// The two multi-select bars (shop redesign).
//
// Desktop's REPLACES the page header rather than floating over it: a bar that
// overlays leaves the old header half-visible underneath, and the page then reads
// as "the shopping list, with a thing on top" instead of "you are selecting". The
// mobile one replaces the tab bar for the same reason — while a selection is held,
// navigating away is not the thing you are about to do.
//
// Both are dark (`--text` on `--bg`-toned ink), which is the only inversion on the
// surface. That is what makes the mode unmistakable without an explanation.
//
// "Move to next week" from the mock is deliberately absent: a derived row is
// recomputed from the plan, so moving one is not a thing the projection can mean.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { CheckIcon, InfoIcon } from './shopIcons'

interface SelectionBarProps {
  count: number
  /** "Whole aisle — Produce", or what else the selection turned out to be. */
  description: string
  onTick: () => void
  onRemove: () => void
  onCancel: () => void
}

/** Desktop: the dark bar standing in for the page header. */
export function SelectionHeaderBar({ count, description, onTick, onRemove, onCancel }: SelectionBarProps) {
  return (
    <div style={darkBar}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600 }}>
        {count} selected
      </div>
      <div style={{ fontSize: 12.5, color: mutedOnBar }}>
        {description} · shift-click to extend
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
        <button type="button" onClick={onTick} style={tickButton}>
          <CheckIcon size={16} strokeWidth={3} />
          Tick {count}
        </button>
        <button type="button" onClick={onRemove} style={ghostButton}>
          Remove
        </button>
        <button type="button" onClick={onCancel} style={cancelButton}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Mobile: the bulk bar that takes the tab bar's place at the bottom. */
export function SelectionBulkBar({ count, onTick, onRemove }: Omit<SelectionBarProps, 'description' | 'onCancel'>) {
  return (
    <div style={bulkBar}>
      <button type="button" onClick={onTick} style={{ ...tickButton, flex: 1, justifyContent: 'center', padding: '12px 0', borderRadius: 13 }}>
        <CheckIcon size={17} strokeWidth={3} />
        Tick {count}
      </button>
      <button type="button" onClick={onRemove} style={{ ...ghostButton, borderRadius: 13, padding: '12px 15px' }}>
        Remove
      </button>
    </div>
  )
}

/** Mobile's one-line answer to "what have I got hold of", above the list. */
export function SelectionNote({ description }: { description: string }) {
  return (
    <div style={note}>
      <InfoIcon size={16} style={{ color: 'var(--accent)' }} />
      <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700 }}>{description}</span>
    </div>
  )
}

/** Secondary text on the inverted bar — see ghostButton for why it is a mix. */
const mutedOnBar = 'color-mix(in srgb, currentColor 72%, transparent)'

const darkBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '22px 34px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--text)',
  color: 'var(--bg)',
}

const bulkBar: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  height: 88,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '0 14px',
  background: 'var(--text)',
  color: 'var(--bg)',
}

const tickButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 12,
  padding: '10px 15px',
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 800,
}

// Mixed from `currentColor`, not from a literal white. The bar inverts the page,
// so in dark mode it is a LIGHT bar with dark ink — and a hardcoded translucent
// white ghost button would vanish into it. Mixing against the bar's own
// foreground keeps the same contrast whichever way round the theme is.
const ghostButton: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 12,
  padding: '10px 15px',
  background: 'color-mix(in srgb, currentColor 12%, transparent)',
  color: 'inherit',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
}

const cancelButton: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: mutedOnBar,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  paddingLeft: 6,
}

const note: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 12,
  padding: '9px 12px',
  background: 'var(--chipbg)',
}
