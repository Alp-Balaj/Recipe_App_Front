// ─────────────────────────────────────────────────────────────────────────
// The rule above a block of rows — an aisle, or a dish (shop redesign).
//
// It does three jobs, and the third is the one that earns the component: it is
// the whole-section SELECTOR. "Everything in Produce" is one click here, which is
// why desktop needs no long-press at all, and it is the only way into multi-select
// with a mouse besides shift-click.
//
// The count reads "2 OF 6 LEFT" rather than "4 of 6 bought", because standing in
// an aisle the useful number is what is still owed.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { CheckIcon } from './shopIcons'
import type { ShoppingSection } from './shoppingModel'

interface SectionHeadingProps {
  section: ShoppingSection
  compact: boolean
  /** True when every row under it is in the selection. */
  allSelected: boolean
  /** Any selection at all, anywhere on the page — the checkbox only shows then. */
  selectionMode: boolean
  selectedCount: number
  onToggleSection: () => void
}

export default function SectionHeading({
  section,
  compact,
  allSelected,
  selectionMode,
  selectedCount,
  onToggleSection,
}: SectionHeadingProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const size = compact ? 19 : 20
  // Touch gets it only in multi-select, which long-press opens: there is no hover
  // on a phone, and a permanently-drawn box there would be the design's
  // multi-select heading showing up on the ordinary list.
  const shown = selectionMode || focused || (!compact && hovered)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 9 : 10,
        padding: compact ? '7px 2px 6px' : '8px 2px 7px',
        // Olive rather than ink while the section is taken: the rule is the only
        // thing wide enough to say "this whole block is selected" at a glance.
        borderBottom: `1.5px solid ${allSelected ? 'var(--accent-fill)' : 'var(--text)'}`,
      }}
    >
      {/* Drawn only once it is relevant — in multi-select, on desktop hover, or
          when focused. The design's default heading is just a name and a count,
          and a permanent empty box on every aisle reads as another thing to tick.
          Hover is how the row's remove button behaves too, so this is the same
          vocabulary rather than a new one.

          It stays in the DOM at all times regardless, because it is the only
          pointer-free way into multi-select: desktop has no long-press, and a
          control that only exists on hover excludes every keyboard user. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={allSelected}
        aria-label={`Select all in ${section.title}`}
        onClick={onToggleSection}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={
          shown
            ? {
                ...checkbox,
                width: size,
                height: size,
                ...(allSelected
                  ? { background: 'var(--accent-fill)', border: 'none', color: 'var(--accent-ink)' }
                  : null),
              }
            : visuallyHidden
        }
      >
        {allSelected && shown && <CheckIcon size={compact ? 12 : 13} />}
      </button>

      {section.eyebrow && <span style={eyebrow}>{section.eyebrow}</span>}

      <span style={{ ...title, fontSize: compact ? 18 : 20 }}>{section.title}</span>

      <span
        style={{
          ...count,
          fontSize: compact ? 11.5 : 12,
          ...(selectedCount > 0 ? { color: 'var(--accent)' } : null),
        }}
      >
        {selectedCount > 0
          ? `${selectedCount} SELECTED`
          : selectionMode
            ? `${section.total} ${section.total === 1 ? 'ITEM' : 'ITEMS'}`
            : `${section.remaining} OF ${section.total} LEFT`}
      </span>
    </div>
  )
}

// Out of sight, still tabbable and still in the accessibility tree.
const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
  background: 'transparent',
}

const checkbox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  padding: 0,
  cursor: 'pointer',
  borderRadius: 6,
  border: '1.7px solid var(--navidle)',
  background: 'transparent',
  color: 'var(--accent-ink)',
}

// The day, in the dish view only. Italic display serif, like the row provenance
// it replaces — in "by dish" the day moves UP to the heading and the rows below
// stop repeating it.
const eyebrow: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 12.5,
  color: 'var(--muted)',
  flexShrink: 0,
}

const title: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  minWidth: 0,
  overflowWrap: 'anywhere',
}

const count: CSSProperties = {
  marginLeft: 'auto',
  flexShrink: 0,
  fontWeight: 800,
  letterSpacing: '0.05em',
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}
