// ─────────────────────────────────────────────────────────────────────────
// The dietary verdict as a BADGE, for the two AI surfaces (stream H).
//
// RecipeInsights renders the same data as a panel on recipe detail, where
// there is room for a list of offending lines. Here there isn't: a proposal
// slot is one row of 21 in a dialog, and the generator result is a single
// line under a text box. So this is the compressed form of the same honesty,
// and the compression is where a safety claim could most easily sneak in.
//
// Three rules it will not bend:
//
//   1. It never says "safe", "OK", "compliant" or anything a hurried reader
//      could take as clearance. A clean result reads "no conflicts found",
//      which is a statement about the SEARCH, not about the food.
//   2. When nothing was found AND nothing was unreadable, it renders NOTHING
//      at all. Twenty-one green ticks would train the eye to skim, and the one
//      row that matters would be skimmed with them. Absence is the quiet case;
//      the badge is the exception that earns attention.
//   3. The uncheckable count travels with every verdict that has one — a
//      clean result over a recipe with unresolved lines is exactly the case
//      where "no conflicts" alone would be a lie of omission (decision D8
//      guarantees such lines will always exist).
//
// The conflicting-ingredient names go in the `title` rather than the row, to
// keep a slot row one line — hover/long-press for detail, and the count is in
// the visible text so the badge is never merely decorative.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { DietaryCheck } from '@/api/types'
import { label } from '@/api/vocabulary'

/** "2 ingredients could not be checked" / "1 ingredient could not be checked". */
function uncheckableText(count: number): string {
  return `${count} ingredient${count === 1 ? '' : 's'} could not be checked`
}

export default function DietaryConflictBadge({
  checks,
  style,
}: {
  /**
   * Typed as required because the wire contract makes it so, but read
   * defensively: the two repos deploy independently, so a frontend that ships
   * ahead of its backend would receive a response without this field. Rendering
   * no badge is a fine degradation; throwing would take the whole card — the
   * generator result, its link, the budget line — down with it.
   */
  checks: DietaryCheck[] | undefined
  /** Layout only — never colour; the variants below carry the meaning. */
  style?: CSSProperties
}) {
  const conflicting = (checks ?? []).filter((check) => check.conflicts.length > 0)
  // Reported once for the recipe, not once per restriction: the count is a
  // property of the ingredient list, so every check over the same recipe
  // carries the same number and repeating it would just be noise.
  const uncheckable = (checks ?? []).reduce((most, check) => Math.max(most, check.uncheckableLines), 0)

  // Rule 2: nothing found and nothing unread — say nothing.
  if (conflicting.length === 0 && uncheckable === 0) return null

  if (conflicting.length > 0) {
    const names = conflicting
      .flatMap((check) => check.conflicts.map((c) => `${c.ingredientName} — ${c.reason}`))
      .join('\n')

    return (
      <span style={{ ...badgeBase, ...conflictStyle, ...style }} title={names}>
        {/* Names the restriction, so "Vegan" and "Nut-free" are distinguishable at a glance. */}
        Conflicts with {conflicting.map((check) => label(check.restriction)).join(', ')}
        {uncheckable > 0 && ` · ${uncheckableText(uncheckable)}`}
      </span>
    )
  }

  // Nothing found, but the check could not read everything. NOT a pass.
  return (
    <span style={{ ...badgeBase, ...partialStyle, ...style }} title={uncheckableText(uncheckable)}>
      No conflicts found · {uncheckableText(uncheckable)}
    </span>
  )
}

const badgeBase: CSSProperties = {
  display: 'inline-block',
  borderRadius: 999,
  padding: '2px 8px',
  fontSize: 11.5,
  fontWeight: 700,
  lineHeight: 1.35,
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
}

// `--danger` is not in the palette; RecipeInsights set the precedent of a literal
// fallback for exactly this case (stream G, G4) rather than adding a token to
// index.css, which the no-redesign rule keeps closed.
const conflictStyle: CSSProperties = {
  background: 'rgba(192, 57, 43, 0.13)',
  color: 'var(--danger, #c0392b)',
}

// Deliberately muted, not green. This state is "we could not read all of it",
// and a reassuring colour would undo the sentence it is carrying.
const partialStyle: CSSProperties = {
  background: 'var(--surface2)',
  color: 'var(--muted)',
  fontWeight: 600,
}
