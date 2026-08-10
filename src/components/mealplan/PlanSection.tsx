// ─────────────────────────────────────────────────────────────────────────
// A ruled, numbered section heading for /plan (plan-page redesign).
//
// The same editorial device Discover uses — hairline rule, № in display italic,
// serif title — but NOT EditorialSection itself: that component owns a recipe
// grid as its body (a lead card plus rows of RecipeCard) and takes items, not
// children. Only the heading is shared vocabulary, so only the heading is
// copied, and this one takes arbitrary children.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactNode } from 'react'

interface Props {
  /** The № on the rule — 1, 2, 3. */
  index: number
  title: string
  /** Sits beside the title: cook time, a denominator, a count. */
  meta?: ReactNode
  /** Pushed right — "Open week ›", "All 34 cooks ›". */
  action?: ReactNode
  children: ReactNode
}

export default function PlanSection({ index, title, meta, action, children }: Props) {
  return (
    <section style={{ minWidth: 0 }}>
      <div style={headingRow}>
        <span style={numeral}>№{index}</span>
        <h2 style={titleStyle}>{title}</h2>
        {meta && <span style={metaStyle}>{meta}</span>}
        {action && <span style={{ marginLeft: 'auto', flexShrink: 0 }}>{action}</span>}
      </div>
      {children}
    </section>
  )
}

const headingRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 9,
  marginBottom: 12,
  borderTop: '1px solid var(--text)',
  paddingTop: 8,
}

const numeral: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 14,
  color: 'var(--muted)',
}

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 19,
  fontWeight: 600,
  margin: 0,
  color: 'var(--text)',
}

const metaStyle: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  minWidth: 0,
}
