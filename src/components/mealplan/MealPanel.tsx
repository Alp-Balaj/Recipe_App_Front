// ─────────────────────────────────────────────────────────────────────────
// One planned meal, opened from the week board (week/shopping rework, Task 8).
//
// The board's rows are a judgment surface, so a chip can only hold a dish name.
// This is where the rest of the evidence for that one dish goes: how long it
// takes, how hard it is, what it plans to cost you in calories, and what it
// needs from the shop.
//
// NO PICKER, deliberately. The week judges, it does not edit — the only write on
// this whole surface is Remove, and the two links out (the recipe, and that day's
// page) are where every other change is made. Adding a picker here would rebuild
// the editor this plan just deleted.
//
// Every calorie figure says PLANNED. This is a planner, not a tracker: nothing
// here knows what was eaten, and a bare "700 kcal" would imply it did.
//
// Presentational — Remove reports up, the page owns the mutation, same rule as
// MealCard and IngredientGroup. It has no `variant` either: the CONTAINER decides
// whether this is a docked rail or a sheet, and the only thing that ever differed
// (a position:sticky) belonged to the rail all along.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { MealPlanEntry } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'
import { useBackdropPath } from '@/components/recipeCanvas'
import { resolveImageUrl } from '@/lib/images'
import { planDayPath } from '@/lib/planDates'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'
import { mealTokens } from './MealCard'
import { formatQuantity } from '@/pages/recipeVisuals'

interface Props {
  /** The element id the row's chips point at with aria-controls. */
  id?: string
  entry: MealPlanEntry
  /** The day this entry sits on, for "Go to this day". */
  date: Date
  /** Full detail, once it has loaded — ingredients and difficulty live only here. */
  recipe?: RecipeResponse
  /** The detail is still in flight; withhold rather than show an empty list. */
  isLoading?: boolean
  /** The detail failed to load: the dish is still named, its ingredients are not. */
  isError?: boolean
  onRemove: () => void
  isRemoving?: boolean
  /** The remove was rejected — say so HERE, not in a page banner. */
  removeFailed?: boolean
  onClose: () => void
}

export default function MealPanel({
  id,
  entry,
  date,
  recipe,
  isLoading = false,
  isError = false,
  onRemove,
  isRemoving = false,
  removeFailed = false,
  onClose,
}: Props) {
  const { tint, ink } = mealTokens(entry.mealType)
  // The recipe opens in the canvas BESIDE the week rather than instead of it, so
  // the backdrop travels with the navigation (recipeCanvas.ts). A bare <Link>
  // drops it and the reader lands in Discover.
  const backdrop = useBackdropPath()

  // totalTimeMinutes rides on the entry itself, so time is known before the
  // detail lands; calories do too. Difficulty and ingredients do not.
  const minutes = recipe?.totalTimeMinutes ?? entry.recipe.totalTimeMinutes
  const calories = recipe?.caloriesPerServing ?? entry.recipe.caloriesPerServing ?? null

  return (
    // No sticky here: on desktop the RAIL is the sticky one, and nesting a second
    // sticky inside it only makes the two fight over the same scroll.
    <section
      id={id}
      style={card}
      aria-label={`${entry.recipe.title}, planned for ${entry.mealType.toLowerCase()}`}
    >
      <div style={header}>
        <span style={{ ...mealLabel, color: ink }}>
          {entry.mealType} · {entry.dayOfWeek}
        </span>
        <button type="button" aria-label="Close" onClick={onClose} style={closeButton}>
          ×
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
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
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h3 style={title}>{entry.recipe.title}</h3>
          <span style={{ ...tintedMeta, background: tint, color: ink }}>
            {[formatMinutes(minutes), recipe?.difficulty, recipe ? `${recipe.servings} servings` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {/* PLANNED, always. The figure is per serving, which is how the day and
              month surfaces count it too — one serving per planned meal. */}
          <span style={calorieLine}>
            {calories != null ? (
              <>
                <span style={figure}>{calories.toLocaleString()}</span> planned kcal per serving
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>No calorie figure — this day is not counted.</span>
            )}
          </span>
        </div>
      </div>

      <div>
        <span style={sectionLabel}>What it needs</span>
        {isLoading && <p style={muted}>Loading its ingredients…</p>}
        {!isLoading && isError && <p style={muted}>Its ingredients didn't load. Try again in a moment.</p>}
        {!isLoading && !isError && recipe && recipe.ingredients.length === 0 && (
          <p style={muted}>This recipe lists no ingredients.</p>
        )}
        {!isLoading && recipe && recipe.ingredients.length > 0 && (
          <div style={ingredients}>
            {recipe.ingredients.map((ingredient, index) => (
              // Index keys: ingredients have no id and the list is replaced
              // wholesale on every load — there is no reorder to preserve.
              <span key={index} style={ingredientRow}>
                <span style={{ overflowWrap: 'anywhere' }}>{ingredient.name}</span>
                {/* Stream G: through formatQuantity like the other two ingredient
                    lists, so "Cup" renders as "cups" rather than as its enum name. */}
                <span style={quantity}>{formatQuantity(ingredient.quantity, ingredient.unit)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div style={actions}>
        {/* planEntryId rides alongside backdrop the same way MealCard's Recipe link
            carries it: RecipeDetailPage reads it to log a cook against this SLOT, not
            just the recipe. Cook mode is reachable straight from the recipe page's own
            "Start cooking" button, with no ?cook=1 in the URL — so dropping this would
            silently fall back to the un-linked cook path from the week board too. */}
        <Link
          to={`/recipes/${entry.recipe.id}`}
          state={{ backdrop, planEntryId: entry.id }}
          style={actionButton}
        >
          Open recipe
        </Link>
        <Link to={planDayPath(date)} style={actionButton}>
          Go to this day
        </Link>
        <button
          type="button"
          style={{ ...actionButton, cursor: 'pointer' }}
          disabled={isRemoving}
          onClick={onRemove}
        >
          {isRemoving ? 'Removing…' : 'Remove'}
        </button>
      </div>

      {/* A successful remove reports itself by closing this panel. A failed one
          has no tell at all — the entry never left the list — so it says so
          here, beside the button that failed. */}
      {removeFailed && (
        <p role="status" style={failure}>
          Couldn&rsquo;t remove that meal. Try again.
        </p>
      )}
    </section>
  )
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const mealLabel: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const closeButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  width: 28,
  height: 28,
  lineHeight: 1,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--muted)',
}

const photo: CSSProperties = {
  width: 66,
  height: 66,
  borderRadius: 15,
  flexShrink: 0,
}

const title: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  lineHeight: 1.25,
  overflowWrap: 'anywhere',
}

const tintedMeta: CSSProperties = {
  alignSelf: 'flex-start',
  borderRadius: 8,
  padding: '2px 7px',
  fontSize: 11.5,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
}

const calorieLine: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const figure: CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const sectionLabel: CSSProperties = {
  display: 'block',
  marginBottom: 4,
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const ingredients: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const ingredientRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  padding: '5px 0',
  borderTop: '1px solid var(--border)',
  fontSize: 13,
}

const quantity: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const actions: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
}

const actionButton: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '6px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
  textDecoration: 'none',
  lineHeight: 1.5,
}

const failure: CSSProperties = {
  margin: 0,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '7px 10px',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--muted)',
}

const muted: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: 'var(--muted)',
}
