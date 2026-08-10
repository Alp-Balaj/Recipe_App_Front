// ─────────────────────────────────────────────────────────────────────────
// The carry-forward banner (shopping list trust rework, Task 10).
//
// The backend now reports last week's unbought items as a `carryover` block
// on the shopping-list response (Task 6). This surfaces that debt exactly
// once: a summary line, an expand toggle to per-item Carry/Skip actions, and
// a Carry all / Dismiss pair for the impatient case. The page wires it in
// only for the current week under scope 'Week' — see ShoppingListPage.tsx's
// `banners` block — and only when `carryover` is present at all; the backend
// returns null, not an empty object, when last week owes nothing.
//
// Styling is a DUPLICATE of ShoppingListPage's `banner`/`bannerButton`
// consts, not an import: ShoppingListPage imports this component, so a
// reverse import back for the two style consts would be circular. The brief
// explicitly permits duplication for exactly this reason — six lines, and
// keeping the page's own module self-contained beats a fragile mutual import.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import type { ShoppingCarryover, ShoppingCarryoverItem } from '@/api/shopping'

export interface CarryoverBannerProps {
  carryover: ShoppingCarryover
  onCarry: (item: ShoppingCarryoverItem) => void
  onDismiss: (item: ShoppingCarryoverItem) => void
  onCarryAll: () => void
  onDismissAll: () => void
  isPending: boolean
}

export default function CarryoverBanner(props: CarryoverBannerProps): JSX.Element {
  const { carryover, onCarry, onDismiss, onCarryAll, onDismissAll, isPending } = props
  const [expanded, setExpanded] = useState(false)
  const count = carryover.items.length

  return (
    <div style={banner}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700 }}>
            Last week had {count} unbought item{count === 1 ? '' : 's'}.
          </span>
          <button
            type="button"
            style={bannerButton}
            disabled={isPending}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Hide items' : 'Show items'}
          </button>
          <button type="button" style={bannerButton} disabled={isPending} onClick={onCarryAll}>
            Carry all
          </button>
          <button type="button" style={bannerButton} disabled={isPending} onClick={onDismissAll}>
            Dismiss
          </button>
        </div>

        {expanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {carryover.items.map((item) => (
              <div key={item.key} style={row}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {item.displayName}
                  {item.remainingDisplay ? ` · ${item.remainingDisplay}` : ''}
                </span>
                <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    aria-label={`Carry ${item.displayName}`}
                    style={bannerButton}
                    disabled={isPending}
                    onClick={() => onCarry(item)}
                  >
                    Carry
                  </button>
                  <button
                    type="button"
                    aria-label={`Skip ${item.displayName}`}
                    style={bannerButton}
                    disabled={isPending}
                    onClick={() => onDismiss(item)}
                  >
                    Skip
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Duplicated from ShoppingListPage.tsx — see the header comment for why.
const banner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  marginBottom: 12,
  overflowWrap: 'anywhere',
}

const bannerButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface)',
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  padding: '4px 0',
}
