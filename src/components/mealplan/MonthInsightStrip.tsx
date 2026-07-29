// ─────────────────────────────────────────────────────────────────────────
// The insight band between the month header and the grid (M2).
//
// One place where everything derived lives, above the fold, so the grid below
// stays a calendar rather than becoming a dashboard. It costs the grid ~86px
// of vertical space, which was the argument against M2 and is the price of
// having the prompt visible without scrolling.
//
// Built to hold two things side by side. The ribbon is the second, and lands
// with the calorie work — until then the gap card has the band to itself,
// which is why the layout is a wrapping flex row and not a fixed two-column
// grid that would leave a hole.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { DinnerGap } from '@/lib/planInsights'
import { planDayPath } from '@/lib/planDates'

interface Props {
  gap: DinnerGap | null
  /** The ribbon slot. */
  children?: ReactNode
}

export default function MonthInsightStrip({ gap, children }: Props) {
  if (!gap && !children) return null

  return (
    <div style={strip}>
      {gap && <NextGapCard gap={gap} />}
      {children}
    </div>
  )
}

/**
 * Open dinners in the days ahead. Three states, because "0 open" is not a
 * degenerate case of "n open" — it is the reward for having planned, and
 * offering a link to fix nothing would be noise.
 */
function NextGapCard({ gap }: { gap: DinnerGap }) {
  const { open, horizonDays, first } = gap

  if (open === 0 || !first) {
    return (
      <section style={{ ...card, flex: '1 1 260px' }} aria-label="Dinners ahead">
        <span style={label}>Dinners ahead</span>
        <span style={settled}>
          Every dinner planned {horizonDays === 1 ? 'for today' : `for the next ${horizonDays} days`}.
        </span>
      </section>
    )
  }

  // A one-day window means today is the last day the grid holds — the plural
  // copy would be claiming a week it cannot see.
  const tonight = horizonDays === 1

  return (
    <section style={{ ...card, flex: '1 1 260px' }} aria-label="Dinners ahead">
      <span style={label}>Dinners ahead</span>
      {tonight ? (
        <span style={line}>Tonight&rsquo;s dinner isn&rsquo;t planned yet.</span>
      ) : (
        <span style={line}>
          <span style={figure}>{open}</span>{' '}
          <span style={{ fontWeight: 700 }}>{open === 1 ? 'dinner' : 'dinners'}</span> open in the
          next {horizonDays} days
        </span>
      )}
      <Link to={planDayPath(first)} style={action}>
        {tonight ? 'Plan tonight' : `Start with ${startLabel(first)}`} &rarr;
      </Link>
    </section>
  )
}

/** "Tue 4 Aug" — short enough to sit on the chip, dated enough to be unambiguous. */
function startLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

const strip: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'stretch',
  flexWrap: 'wrap',
  marginBottom: 14,
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 13px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  alignItems: 'flex-start',
  minWidth: 0,
}

const label: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const line: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.35,
}

const figure: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const settled: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  lineHeight: 1.35,
}

const action: CSSProperties = {
  marginTop: 2,
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  borderRadius: 999,
  padding: '4px 11px',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.04em',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
