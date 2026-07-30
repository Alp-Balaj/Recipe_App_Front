// ─────────────────────────────────────────────────────────────────────────
// What the week costs at the shop, and what it repeats (week/shopping rework, Task 8).
//
// The two lowest-ranked signals on the board, and they are week-level rather
// than per-day, so they sit under the rows instead of inside them: grocery
// weight second, dinner repetition last and in ONE line.
//
// The grocery read is NEUTRAL. "Slow lamb ragù uses 9 ingredients unique to this
// week" is a fact the reader can act on however they like; "this dish is
// expensive" is a verdict on a meal they chose on purpose. This is a balance
// view, not a scold — same reason the repetition line names the dish and stops.
//
// Repeats cover DINNERS only (see dinnerRepeats): eating the same oats every
// weekday is a deliberate, efficient choice and flagging it would be nagging.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { GroceryInsight } from '@/api/mealPlans'

interface Props {
  insight?: GroceryInsight
  /** The insight is in flight — withhold the figures rather than show zeros. */
  isLoading?: boolean
  /** Dinners planned more than once this week, from dinnerRepeats. */
  repeats: { title: string; count: number }[]
}

export default function WeekSummary({ insight, isLoading = false, repeats }: Props) {
  return (
    <section style={card} aria-label="What this week costs at the shop">
      <div style={head}>
        <span style={label}>At the shop</span>
        <Link to="/shopping-list" style={action}>
          Shopping list &rarr;
        </Link>
      </div>

      {isLoading && <p style={line}>Working out this week's shop…</p>}

      {!isLoading && insight && insight.distinctIngredientCount > 0 && (
        <p style={line}>
          <span style={figure}>{insight.distinctIngredientCount}</span> ingredients this week
          {insight.sharedIngredientCount > 0 && (
            <>
              , <span style={{ fontWeight: 700 }}>{insight.sharedIngredientCount} of them</span> wanted
              by more than one dish
            </>
          )}
          .
        </p>
      )}

      {!isLoading && insight?.outlier && (
        <p style={line}>
          <span style={{ fontWeight: 700 }}>{insight.outlier.title}</span> uses{' '}
          {insight.outlier.uniqueIngredientCount} ingredients unique to this week.
        </p>
      )}

      {!isLoading && insight && insight.distinctIngredientCount === 0 && (
        <p style={line}>Nothing planned yet, so there is nothing to buy.</p>
      )}

      {repeats.length > 0 && (
        <p style={line}>
          {repeats.map((repeat, index) => (
            <span key={repeat.title}>
              {index > 0 && ' · '}
              <span style={{ fontWeight: 700 }}>{repeat.title}</span> {countWord(repeat.count)}
            </span>
          ))}{' '}
          for dinner this week.
        </p>
      )}
    </section>
  )
}

/** "twice" / "3 times" — the word reads better than the digit at 2. */
function countWord(count: number): string {
  return count === 2 ? 'twice' : `${count} times`
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 13px',
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
}

const head: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const label: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const action: CSSProperties = {
  flexShrink: 0,
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

const line: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
}

const figure: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}
