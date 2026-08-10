// ─────────────────────────────────────────────────────────────────────────
// "In your kitchen" — can you actually cook tonight? (plan-page redesign §2b)
//
// BUILT AND UNUSED, on purpose. There is no pantry yet — see
// hooks/usePantryReadiness.ts, which returns null and is the entire gap. The
// page renders a full-width hero while that is so, and this card lights up in
// its designed column the moment that hook returns data. Nothing here needs to
// change when it does.
//
// Two rules from the handoff that are load-bearing rather than decorative:
//
//   - Clay, never accent, for missing items. In this app --clay means "this
//     will cost you something"; painting a shortfall in the accent colour reads
//     as an achievement.
//   - This card never writes. Its footer LINKS to /shopping-list — the Shop tab
//     owns the missing-items problem, and the shop projection derives its rows
//     from the plan rather than from anything typed here.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { PantryReadiness } from '@/hooks/usePantryReadiness'

interface Props {
  readiness: PantryReadiness
}

export default function KitchenReadinessCard({ readiness }: Props) {
  const { have, needed, missing, tomorrow } = readiness
  const missingCount = missing.length

  // Guard the denominator rather than the numerator: a card that has counted
  // nothing must not render a full bar, which is what have/0 would do.
  const percent = needed > 0 ? Math.round((have / needed) * 100) : 0

  return (
    <div style={card}>
      <div style={head}>
        <span style={eyebrow}>IN YOUR KITCHEN</span>
        <span style={score}>
          {have} / {needed}
        </span>
      </div>

      <div style={track} role="img" aria-label={`${have} of ${needed} ingredients in the kitchen`}>
        <div style={{ ...fill, width: `${percent}%` }} />
      </div>

      <div style={sentence}>{sentenceFor(missingCount)}</div>

      {missingCount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {missing.map((item, index) => (
            <div
              key={item.name}
              style={{
                ...missingRow,
                // Hairline between rows, never after the last — the card's own
                // edge closes the block.
                ...(index < missingCount - 1
                  ? { paddingBottom: 7, borderBottom: '1px solid var(--hair)' }
                  : null),
              }}
            >
              <span style={dot} />
              <span style={missingName}>{item.name}</span>
              <span style={missingQuantity}>{item.quantityLabel}</span>
            </div>
          ))}
        </div>
      )}

      {tomorrow && (
        <div style={tomorrowLine}>
          <span style={tomorrowLabel}>Tomorrow</span>
          <span style={tomorrowBody}>
            {tomorrow.title} —{' '}
            {tomorrow.missingCount === 0
              ? 'everything in stock'
              : `${tomorrow.missingCount} short`}
          </span>
          {tomorrow.missingCount === 0 && <span style={tick}>✓</span>}
        </div>
      )}

      <Link to="/shopping-list" style={action}>
        {missingCount > 0 ? `Add ${missingCount} to shopping list ›` : 'Open shopping list ›'}
      </Link>
    </div>
  )
}

function sentenceFor(missingCount: number): string {
  if (missingCount === 0) return 'Everything for tonight is in the kitchen.'
  if (missingCount === 1) return 'You have most of tonight — one thing short.'
  if (missingCount === 2) return 'You have most of tonight — two things short.'
  return `You are ${missingCount} things short for tonight.`
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 24,
  padding: '20px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const head: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
}

const eyebrow: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  color: 'var(--muted)',
}

const score: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 19,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
}

const track: CSSProperties = {
  height: 6,
  borderRadius: 99,
  background: 'var(--surface2)',
  overflow: 'hidden',
}

const fill: CSSProperties = {
  height: '100%',
  background: 'var(--accent-fill)',
}

const sentence: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'var(--text)',
}

const missingRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
}

const dot: CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: 99,
  background: 'var(--clay)',
  flexShrink: 0,
}

const missingName: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  fontWeight: 600,
  flex: 1,
  minWidth: 0,
  color: 'var(--text)',
}

const missingQuantity: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const tomorrowLine: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  paddingTop: 11,
  borderTop: '1px solid var(--border)',
}

const tomorrowLabel: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 12.5,
  color: 'var(--muted)',
  flexShrink: 0,
}

const tomorrowBody: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  flex: 1,
  minWidth: 0,
}

const tick: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--accent)',
  flexShrink: 0,
}

const action: CSSProperties = {
  marginTop: 'auto',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '0.02em',
  textDecoration: 'none',
}
