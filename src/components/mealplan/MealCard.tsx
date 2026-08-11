// ─────────────────────────────────────────────────────────────────────────
// One meal on the day page (meal-plan redesign, day-page PR).
//
// The week board's meal chip is one of 21 sharing a screen; this is one of three
// on a page of its own, so it carries what the board deliberately omits —
// servings, ingredient count, a way into the recipe.
//
// Meal temperature (--meal-b / -l / -d) arrives as a 5px band rather than a
// background wash: at this size a full tint would compete with the food
// photograph, which is the one thing on the card worth looking at.
//
// Presentational — every decision about what an action means belongs to the
// page, same rule as the week board's row and panel.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { MealPlanEntry, MealTypeName } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'
import { useBackdropPath } from '@/components/recipeCanvas'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

/** Tint + solid for one meal, from the theme's meal-temperature tokens. */
export function mealTokens(meal: MealTypeName): { tint: string; ink: string } {
  switch (meal) {
    case 'Breakfast':
      return { tint: 'var(--meal-b)', ink: 'var(--meal-b-ink)' }
    case 'Lunch':
      return { tint: 'var(--meal-l)', ink: 'var(--meal-l-ink)' }
    default:
      return { tint: 'var(--meal-d)', ink: 'var(--meal-d-ink)' }
  }
}

interface Props {
  meal: MealTypeName
  entry?: MealPlanEntry
  /** Full detail for the planned recipe, once it has loaded. */
  recipe?: RecipeResponse
  /** Details are still in flight — show a placeholder instead of "0 ingredients". */
  detailLoading?: boolean
  /** Empty slot tapped — the page opens the picker. */
  onAdd?: () => void
  /**
   * Replace what's here. Changing your mind is the most common edit on this
   * page, so it gets its own verb rather than being remove-then-add — which
   * would leave the slot empty if the second half failed.
   */
  onSwap?: () => void
  onRemove?: () => void
  /**
   * Put this same dish on tomorrow's plate in the same slot — the leftovers
   * gesture, kept deliberately dumb. It asks no questions about servings or
   * household size; you cooked a lot of it, you're having it again.
   */
  onRepeatTomorrow?: () => void
  /**
   * Log that this actually got made (open-loops slice 1). The page decides when
   * to offer it — a dish planned for next Thursday has not been cooked yet — and
   * what it means; this card only renders the button, like every other action.
   */
  onCooked?: () => void
  /**
   * When this meal was cooked, or null. Present makes the card render its settled
   * state instead of the "I cooked this" action.
   */
  cookedAt?: string | null
  /**
   * Undo the cook. The page always supplies this when `cookedAt` is set, INCLUDING on a
   * future day: `onCooked`'s past-or-today gate is about MARKING, and an undo the user
   * cannot reach is the trust bug this roadmap exists to fix.
   */
  onUncook?: () => void
  /** Past days are a record of what you ate, so they don't invite additions. */
  isPast?: boolean
}

export default function MealCard({
  meal,
  entry,
  recipe,
  detailLoading = false,
  onAdd,
  onSwap,
  onRemove,
  onRepeatTomorrow,
  onCooked,
  cookedAt,
  onUncook,
  isPast = false,
}: Props) {
  const { tint, ink } = mealTokens(meal)
  // "Recipe" opens the canvas beside the day, not instead of it: the backdrop
  // travels with the navigation (recipeCanvas.ts), so the day page stays in the
  // pane. A bare <Link> drops it and the reader lands in Discover.
  //
  // `entry.id` rides the same state object (Task 7, cooked-per-plan-entry) —
  // it's how cook mode's "Finished cooking" learns which plan slot to log
  // against, so cooking a meal the long way round can resolve its shopping
  // group too.
  const backdrop = useBackdropPath()

  if (!entry) {
    const label = isPast ? `No ${meal.toLowerCase()} recorded` : `Add ${meal.toLowerCase()}`
    return (
      <button
        type="button"
        data-testid={`day-slot-${meal}`}
        aria-label={`Add a recipe for ${meal}`}
        style={{ ...emptyCard, opacity: isPast ? 0.55 : 1, cursor: onAdd ? 'pointer' : 'default' }}
        disabled={!onAdd}
        onClick={onAdd}
      >
        <span style={{ ...band, background: ink, opacity: 0.45 }} />
        <span style={{ ...slotLabel, color: ink }}>{meal}</span>
        <span style={emptyPrompt}>{label}</span>
      </button>
    )
  }

  // An UNAVAILABLE slot (KAN-1): the entry survives — the user planned this meal and the
  // plan still says so — but its recipe was removed or is no longer shared with them, so
  // every field the card renders from is gone. It is deliberately NOT the empty-slot branch
  // above: an empty slot invites you to add something, and this one is already taken.
  //
  // Copy says "unavailable" and stops there, the same rule the cook log follows (KAN-2,
  // ADR-0001): "unavailable" is ONE user-visible state, and naming which of the two causes
  // applied would report an author's private visibility decision to a stranger.
  //
  // Two actions survive, and both for the same reason — ADR-0001 splits WRITES BY
  // DIRECTION: one that creates a relationship to the recipe needs visibility, one that
  // destroys the caller's own row does not.
  //
  //   Remove   — clears the slot. A slot its owner can neither open nor clear is exactly
  //              the orphan that rule exists to prevent.
  //   ✓ Cooked — the UNDO. Un-cooking is `unlog({ mealPlanEntryId })`: it needs no recipe
  //              id, and UncookEntryAsync gates on ownership, never on visibility (KAN-3).
  //              This card is the app's ONLY un-cook surface, so withholding it here is
  //              not a cosmetic loss — it strands the cook permanently, and the one button
  //              left would delete the plan entry instead of undoing the cook.
  //
  // Everything else needs a recipe id — Recipe, Swap, Repeat, and "I cooked this" itself
  // (logging a cook CREATES a relationship, so the server refuses it) — and would 404 on
  // press, so none of those is offered.
  if (!entry.recipe) {
    return (
      <div
        data-testid={`day-slot-${meal}`}
        style={{ ...filledCard, background: tint, opacity: isPast ? 0.55 : 0.75 }}
      >
        <span style={{ ...band, background: ink }} />
        <span style={{ ...photo, background: 'var(--tagbg)' }} />
        <span style={info}>
          <span style={{ ...slotLabel, color: ink }}>{meal}</span>
          <span style={name}>Recipe unavailable</span>
          <span style={metaLine}>
            {cookedAt ? 'You cooked this — you can no longer open it' : 'Still planned — you can no longer open it'}
          </span>
        </span>
        <span style={actions}>
          {cookedAt && (
            <button
              type="button"
              aria-label={`Undo cooked for the unavailable ${meal.toLowerCase()}`}
              style={{ ...actionButton, ...cookedButton, cursor: onUncook ? 'pointer' : 'default' }}
              disabled={!onUncook}
              onClick={onUncook}
            >
              ✓ Cooked
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove the unavailable ${meal.toLowerCase()}`}
              style={{ ...actionButton, cursor: 'pointer' }}
              onClick={onRemove}
            >
              ×
            </button>
          )}
        </span>
      </div>
    )
  }

  const meta = recipe
    ? [
        formatMinutes(recipe.totalTimeMinutes),
        `${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}`,
        `${recipe.ingredients.length} ${recipe.ingredients.length === 1 ? 'ingredient' : 'ingredients'}`,
      ].join(' · ')
    : detailLoading
      ? 'Loading details…'
      : 'Details unavailable'

  return (
    <div data-testid={`day-slot-${meal}`} style={{ ...filledCard, background: tint }}>
      <span style={{ ...band, background: ink }} />
      <span
        style={{
          ...photo,
          ...(entry.recipe.imageUrl
            ? {
                backgroundImage: `url(${resolveImageUrl(entry.recipe.imageUrl)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: gradientFor(entry.recipe.id || entry.recipe.title) }),
        }}
      />
      <span style={info}>
        <span style={{ ...slotLabel, color: ink }}>{meal}</span>
        <span style={name}>{entry.recipe.title}</span>
        <span style={metaLine}>{meta}</span>
      </span>
      <span style={actions}>
        <Link
          to={`/recipes/${entry.recipe.id}`}
          state={{ backdrop, planEntryId: entry.id }}
          style={actionButton}
        >
          Recipe
        </Link>
        {cookedAt ? (
          <button
            type="button"
            aria-label={`Undo cooked for ${entry.recipe.title}`}
            style={{ ...actionButton, ...cookedButton, cursor: onUncook ? 'pointer' : 'default' }}
            disabled={!onUncook}
            onClick={onUncook}
          >
            ✓ Cooked
          </button>
        ) : (
          onCooked && (
            <button
              type="button"
              aria-label={`Mark ${entry.recipe.title} as cooked`}
              style={{ ...actionButton, cursor: 'pointer' }}
              onClick={onCooked}
            >
              I cooked this
            </button>
          )
        )}
        {onSwap && (
          <button
            type="button"
            aria-label={`Swap ${entry.recipe.title}`}
            style={{ ...actionButton, cursor: 'pointer' }}
            onClick={onSwap}
          >
            Swap
          </button>
        )}
        {onRepeatTomorrow && (
          <button
            type="button"
            aria-label={`Repeat ${entry.recipe.title} tomorrow`}
            style={{ ...actionButton, cursor: 'pointer' }}
            onClick={onRepeatTomorrow}
          >
            Repeat tomorrow
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${entry.recipe.title}`}
            style={{ ...actionButton, cursor: 'pointer' }}
            onClick={onRemove}
          >
            ×
          </button>
        )}
      </span>
    </div>
  )
}

const cardBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  minWidth: 0,
  borderRadius: 18,
  padding: 10,
  fontFamily: 'inherit',
  textAlign: 'left',
}

const filledCard: CSSProperties = {
  ...cardBase,
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
}

const emptyCard: CSSProperties = {
  ...cardBase,
  background: 'transparent',
  border: '1px dashed var(--border)',
  padding: '18px 10px',
  color: 'var(--muted)',
}

const band: CSSProperties = {
  width: 5,
  alignSelf: 'stretch',
  minHeight: 34,
  borderRadius: 3,
  flexShrink: 0,
}

const photo: CSSProperties = {
  width: 58,
  height: 58,
  borderRadius: 14,
  flexShrink: 0,
}

const info: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const slotLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const name: CSSProperties = {
  fontSize: 15.5,
  fontWeight: 800,
  letterSpacing: '-0.008em',
  lineHeight: 1.25,
  overflowWrap: 'anywhere',
}

const metaLine: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const emptyPrompt: CSSProperties = {
  flex: 1,
  fontSize: 13,
  fontWeight: 700,
}

// Four actions is one more than this row was built for, so it wraps rather
// than squeezing the dish name — "Repeat tomorrow" drops to its own line on a
// narrow card instead of pushing the title into an ellipsis.
const actions: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  maxWidth: '52%',
}

const actionButton: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 10px',
  fontFamily: 'inherit',
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
  textDecoration: 'none',
  lineHeight: 1.5,
}

// A settled state that undoes on tap, not a second button competing with the first —
// the row already carries four actions and a fifth would push the dish name into an
// ellipsis. Accent-filled so "done" reads at a glance from across a kitchen.
const cookedButton: CSSProperties = {
  background: 'var(--accent-fill)',
  borderColor: 'var(--accent)',
  color: 'var(--accent-ink)',
}
