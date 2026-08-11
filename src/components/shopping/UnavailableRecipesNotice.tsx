// ─────────────────────────────────────────────────────────────────────────
// "N planned meals' recipes are no longer available." (KAN-1)
//
// Lifted out of EmptyWeekExplainer, which only ever rendered under `total === 0`.
// That was the wrong gate: an unavailable recipe SHORTENS the list rather than
// emptying it, so the one reader who was told nothing was the one with other
// meals — a shopper who simply walked out without the tagine's ingredients and
// no idea anything was missing. It now renders wherever the count is non-zero,
// beside a populated list or an empty one.
//
// The copy names a COUNT and stops there. It cannot name the dish (the title is
// the author's content, withheld with the rest) and must not name the cause:
// "removed" and "no longer shared with you" are one user-visible state, because
// reporting an author's private visibility decision to a stranger is itself the
// leak (ADR-0001, and the same rule the cook log's badge follows).
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'

export interface UnavailableRecipesNoticeProps {
  /** Summed across every week on screen — under scope=All there is more than one. */
  count: number
}

export default function UnavailableRecipesNotice({
  count,
}: UnavailableRecipesNoticeProps): JSX.Element | null {
  if (count <= 0) return null

  return (
    <div style={card} role="status">
      {count === 1
        ? "1 planned meal's recipe is no longer available, so its ingredients aren't on this list."
        : `${count} planned meals' recipes are no longer available, so their ingredients aren't on this list.`}
    </div>
  )
}

// The page's banner idiom, matching EmptyWeekExplainer's own card (which this was
// extracted from) and ShoppingListPage's `banner` const.
const card: CSSProperties = {
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
}
