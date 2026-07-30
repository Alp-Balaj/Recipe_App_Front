// ─────────────────────────────────────────────────────────────────────────
// The "hide bought" control (week/shopping rework, Task 6).
//
// This is deliberately a CONTROL and not a container. Ticked rows stay exactly
// where they are, dimmed, until you ask for them to go — so the list never
// reorders itself while you are reading it — and asking is this one button.
// Collapsing therefore REMOVES rows from the list rather than moving them into a
// section here, and the only thing left to render is the count that came back
// with them, so you can always get them again.
//
// Nothing renders at all when nothing is bought: offering to hide zero rows is
// an invitation to wonder what it would do.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'

// Local, deliberately NOT exported: nothing outside this file consumes it (week/
// shopping rework fix wave — it was exported and never imported).
interface BoughtSectionProps {
  /** How many groups are ticked across the visible scope. */
  count: number
  collapsed: boolean
  onToggle: () => void
}

export default function BoughtSection({ count, collapsed, onToggle }: BoughtSectionProps) {
  if (count === 0) return null

  return (
    <div style={wrap}>
      <button type="button" onClick={onToggle} style={toggle}>
        {collapsed ? 'Show' : 'Hide'} bought ({count})
      </button>
      {collapsed && (
        <span style={note}>
          {count === 1 ? '1 bought item hidden' : `${count} bought items hidden`}
        </span>
      )}
    </div>
  )
}

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

const toggle: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 11,
  padding: '6px 11px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}

const note: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}
