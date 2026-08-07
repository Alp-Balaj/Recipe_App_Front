// ─────────────────────────────────────────────────────────────────────────
// One numbered section of the Discover front page (Discover redesign, §C).
//
// Replaces the single flat "Trending now" grid with three ruled, numbered
// departments — a kitchen journal's contents page. Each is the same body
// pattern at two scales: one lead image card, then dense rows.
//
// The section owns the rule, the number and the "All ›" link; the cards are the
// shared RecipeCard's editorial variants, so nothing here knows how to draw a
// recipe.
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import type { RecipeResponse } from '@/api/types'
import RecipeCard from '@/components/RecipeCard'

export interface EditorialItem {
  recipe: RecipeResponse
  /** Replaces the default "20 min · Easy" line (From your people shows a poster). */
  meta?: ReactNode
  /** Lead card only: the pill over the image ("15 min"). */
  badge?: ReactNode
}

interface EditorialSectionProps {
  /** The № on the header — 1, 2, 3. */
  index: number
  title: string
  items: EditorialItem[]
  onOpen: (recipeId: string) => void
  isDesktop: boolean
  /** "All ›" — omitted renders no link. */
  onSeeAll?: () => void
  seeAllLabel?: string
}

export default function EditorialSection({
  index,
  title,
  items,
  onOpen,
  isDesktop,
  onSeeAll,
  seeAllLabel = 'All ›',
}: EditorialSectionProps) {
  if (items.length === 0) return null

  const [lead, ...rows] = items

  return (
    <section style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 10,
          // The rule is heavier on mobile, where it is the only thing separating
          // two sections in one column; on desktop the gutter already does that.
          borderTop: isDesktop ? '1px solid var(--text)' : '2px solid var(--text)',
          paddingTop: 8,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontStyle: 'italic',
            fontSize: isDesktop ? 14 : 15,
            color: 'var(--muted)',
          }}
        >
          №{index}
        </span>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: isDesktop ? 18 : 20,
            fontWeight: 600,
            margin: 0,
            color: 'var(--text)',
          }}
        >
          {title}
        </h2>
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            style={{
              marginLeft: 'auto',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--accent)',
              padding: 0,
            }}
          >
            {seeAllLabel}
          </button>
        )}
      </div>

      <RecipeCard
        recipe={lead.recipe}
        variant="editorialLead"
        dense={isDesktop}
        meta={lead.meta}
        badge={lead.badge}
        onOpen={() => onOpen(lead.recipe.id)}
      />

      {rows.map((item, i) => (
        <div
          key={item.recipe.id}
          // Hairline between rows, never after the last one — the section's own
          // top rule is what closes the block.
          style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--hair)' : undefined }}
        >
          <RecipeCard
            recipe={item.recipe}
            variant="editorialRow"
            dense={isDesktop}
            meta={item.meta}
            onOpen={() => onOpen(item.recipe.id)}
          />
        </div>
      ))}
    </section>
  )
}
