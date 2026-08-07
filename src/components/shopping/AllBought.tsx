// ─────────────────────────────────────────────────────────────────────────
// "Everything's ticked" (shop redesign) — the screen that replaces the list once
// the week's shopping is done.
//
// It reads as a RECEIPT: one card per aisle with what it held, in the order you
// walked them. That is a deliberate second look at work already finished — the
// list itself dims rows in place and never celebrates, so the celebration happens
// once, here, when there is nothing left to tick.
//
// The footer CTA is the obvious next move, and it is cooking — not scanning. The
// receipt scanner lives on the list, where it can still reconcile something.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { CheckIcon } from './shopIcons'
import type { AisleSummary, DishSummary } from './shoppingModel'

interface AllBoughtProps {
  total: number
  /** "Mon 3 – Sun 9 Aug", or null under scope 'All' where there is no one week. */
  range: string | null
  aisles: AisleSummary[]
  /** The next dish to cook, if the week still has one — drives the footer CTA. */
  nextDish: DishSummary | null
  compact: boolean
}

export default function AllBought({ total, range, aisles, nextDish, compact }: AllBoughtProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <h1 style={{ ...heading, fontSize: compact ? 31 : 38 }}>Everything's ticked</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 7 }}>
        {total} of {total}
        {range && ` · ${range}`}
      </div>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {aisles.map((aisle) => (
          <div key={aisle.aisle} style={receiptCard}>
            <span style={tick}>
              <CheckIcon size={15} />
            </span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, flex: 1 }}>
              {aisle.aisle}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              {aisle.total}
            </span>
          </div>
        ))}
      </div>

      {nextDish && (
        // /plan is the front door to the week — the dish itself has no route that
        // takes a title, and inventing one to "cook tonight" would be a dead link.
        //
        // The phone reserves the FAB's height below it: the shell floats "new
        // recipe" 88px up the right edge on every tab page, and a full-width CTA
        // pinned to the bottom lands straight underneath it.
        <Link to="/plan" style={{ ...cta, marginTop: 'auto', marginBottom: compact ? 52 : 0 }}>
          Cook {occasion(nextDish.date)} {nextDish.title} ›
        </Link>
      )}
    </div>
  )
}

/**
 * "tonight's" when the dish is today, otherwise the full weekday — "Monday's".
 * Never the abbreviation: "Cook Mon's Shakshuka" is not a sentence anybody says.
 */
function occasion(iso: string | null): string {
  if (!iso) return "tonight's"
  const date = new Date(iso)
  const today = new Date()
  const sameDay =
    date.getUTCFullYear() === today.getUTCFullYear() &&
    date.getUTCMonth() === today.getUTCMonth() &&
    date.getUTCDate() === today.getUTCDate()
  return sameDay
    ? "tonight's"
    : `${date.toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })}'s`
}

const heading: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  lineHeight: 1.1,
  letterSpacing: '-0.015em',
  margin: 0,
}

const receiptCard: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 13,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 15,
  padding: '14px 16px',
}

const tick: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
  flexShrink: 0,
}

const cta: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  borderRadius: 16,
  padding: '14px 15px',
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
  fontSize: 14.5,
  fontWeight: 800,
  textDecoration: 'none',
  marginTop: 24,
}
