// ─────────────────────────────────────────────────────────────────────────
// "Next up" — /plan's cover story (plan-page redesign §2a).
//
// The cover-story treatment is lifted from DiscoverHero's desktop variant, but
// the GEOMETRY is deliberately not DiscoverHero's and this is the one thing to
// preserve when editing:
//
//   - `minHeight: 300`, never a fixed `height`. DiscoverHero's fixed 310px
//     clips the CTA row once the hero is nested in a 1.55fr column.
//   - `clamp(150px, 26%, 240px)` for the photo column, never a plain fr. At
//     1024–1150px a `1.5fr / 1fr` split leaves the text panel ~180px, and the
//     two action buttons have nowhere to go.
//   - `flexWrap` on the action row, for the same width. The buttons must be
//     allowed to stack rather than overflow.
//
// The card renders whatever it is given and fetches nothing; the page owns
// which entry is "next".
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { PlannedMealPlanEntry } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

interface Props {
  /**
   * Always carries a recipe: `nextUp` skips unavailable meals, and this hero has
   * nothing to render without one (KAN-1). Stated in the type so the invariant is
   * checked rather than remembered.
   */
  entry: PlannedMealPlanEntry
  /** "TONIGHT" / "TOMORROW" / "THURSDAY". */
  whenLabel: string
  /** Full detail, once loaded — the meta line needs servings and ingredients. */
  recipe?: RecipeResponse
  onStartCooking: () => void
  onSwap: () => void
}

export default function NextUpHero({ entry, whenLabel, recipe, onStartCooking, onSwap }: Props) {
  const image = entry.recipe.imageUrl

  // Same fallback as MealCard: a deterministic warm gradient keyed by the dish,
  // so an image-less recipe still reads as a photograph-shaped thing rather
  // than as a hole.
  const photo: CSSProperties = image
    ? {
        backgroundImage: `url(${resolveImageUrl(image)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundImage: gradientFor(entry.recipe.id || entry.recipe.title) }

  return (
    // The dish name deliberately appears twice on this page — here and as its
    // chip in the week strip — so the hero is addressable on its own.
    <div style={wrapper} data-testid="next-up-hero">
      <div style={{ ...photoColumn, ...photo }} role="presentation" />

      <div style={panel}>
        <div style={eyebrow}>
          NEXT UP · {entry.mealType.toUpperCase()}, {whenLabel}
        </div>

        <div style={title}>{entry.recipe.title}</div>

        <div style={meta}>{metaLine(entry, recipe)}</div>

        <div style={actions}>
          <button type="button" onClick={onStartCooking} style={primaryAction}>
            Start cooking
          </button>
          <button type="button" onClick={onSwap} style={secondaryAction}>
            Swap
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * "45 min · Easy · 2 servings · 8 ingredients".
 *
 * The entry's own recipe summary carries only title, image and total time, so
 * the last three parts wait on GET /recipes/{id}. Each part is dropped rather
 * than defaulted while that is in flight — "0 ingredients" is a claim, and a
 * wrong one.
 */
function metaLine(entry: Props['entry'], recipe?: RecipeResponse): string {
  const parts: string[] = [formatMinutes(entry.recipe.totalTimeMinutes)]

  if (recipe) {
    parts.push(recipe.difficulty)
    parts.push(`${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}`)
    parts.push(
      `${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? 'ingredient' : 'ingredients'}`,
    )
  }

  return parts.join(' · ')
}

const wrapper: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'clamp(150px, 26%, 240px) minmax(0, 1fr)',
  minHeight: 300,
  borderRadius: 24,
  overflow: 'hidden',
  boxShadow: 'var(--cardsh)',
  minWidth: 0,
}

const photoColumn: CSSProperties = {
  position: 'relative',
  minWidth: 0,
  minHeight: 300,
}

const panel: CSSProperties = {
  background: 'var(--surface2)',
  padding: '26px 24px',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 9,
  minWidth: 0,
}

const eyebrow: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.14em',
  color: 'var(--tagcol)',
}

const title: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(21px, 2.1vw, 29px)',
  fontWeight: 600,
  lineHeight: 1.08,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  textWrap: 'pretty',
}

const meta: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  textWrap: 'pretty',
}

const actions: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 9,
  marginTop: 6,
}

const primaryAction: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  fontFamily: 'inherit',
  borderRadius: 12,
  padding: '11px 20px',
  fontSize: 14,
  fontWeight: 800,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
}

const secondaryAction: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  fontFamily: 'inherit',
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '10px 15px',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--muted)',
}
