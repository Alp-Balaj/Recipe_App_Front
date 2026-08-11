// ─────────────────────────────────────────────────────────────────────────
// What one day costs you (meal-plan insights, day PR) — the D1 strip.
//
// This is the cheapest real information on the whole /plan surface: the day
// page already fetches every planned recipe IN FULL for its ingredient groups
// (useDayRecipes), so calories, cook time and the per-meal split are sitting in
// that cache. Zero extra requests. The month view cannot say any of this
// without a request per distinct dish, which is why it lives here first.
//
// House rule from the brief — EVERY NUMBER SHOWS ITS DENOMINATOR. The two
// figures have DIFFERENT ones and so they carry their own:
//   · time comes from totalTimeMinutes, which is never null, so it is complete
//     for every recipe that loaded at all;
//   · calories come from caloriesPerServing, which IS nullable, so a day can
//     have three meals and one calorie figure.
// A single shared "2 of 3" line would have been tidier and wrong.
//
// While details are in flight the figures are withheld rather than shown low
// and corrected upward: a total that changes while you read it is worse than a
// late one. Same reasoning the month view uses for its own partial data.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { MealPlanEntry, MealTypeName } from '@/api/mealPlans'
import type { RecipeResponse } from '@/api/types'
import { formatMinutes } from '@/pages/recipeVisuals'
import { mealTokens } from './MealCard'

export interface DaySlot {
  meal: MealTypeName
  entry?: MealPlanEntry
  /** Full detail for the planned recipe, once it has loaded. */
  recipe?: RecipeResponse
}

interface Props {
  slots: DaySlot[]
  /** At least one planned recipe's detail is still in flight. */
  isLoading: boolean
}

export default function DayTotals({ slots, isLoading }: Props) {
  const planned = slots.filter((slot) => slot.entry)
  // Nothing planned is not a zero — it's a day with no question to answer.
  if (planned.length === 0) return null

  const withRecipe = planned.filter((slot) => slot.recipe)
  const withCalories = withRecipe.filter((slot) => slot.recipe?.caloriesPerServing != null)

  const minutes = withRecipe.reduce((sum, slot) => sum + (slot.recipe?.totalTimeMinutes ?? 0), 0)
  // caloriesPerServing, summed one serving per meal — the day as a person eats
  // it, not as it's cooked (a recipe serving four still contributes one).
  const calories = withCalories.reduce((sum, slot) => sum + (slot.recipe?.caloriesPerServing ?? 0), 0)

  // Every planned recipe failed to load: the page already banners that, and a
  // strip with two blanks in it would just be repeating the bad news.
  if (!isLoading && withRecipe.length === 0) return null

  const missing = withCalories.length < planned.length
  const missingTitles = planned
    .filter((slot) => slot.recipe && slot.recipe.caloriesPerServing == null)
    .map((slot) => slot.entry?.recipe?.title ?? '')
    .filter(Boolean)

  // Proportional widths would misread the day whenever a figure is missing —
  // the bar would silently redistribute the gap across the meals that do have
  // one. Equal widths until every planned meal is counted.
  const proportional = withCalories.length === planned.length && calories > 0

  return (
    <section style={card} aria-label="Totals for this day">
      <div style={figures}>
        {withCalories.length > 0 && (
          <Figure
            value={calories.toLocaleString()}
            unit="kcal"
            qualifier={
              withCalories.length < planned.length
                ? `from ${withCalories.length} of ${planned.length} meals`
                : undefined
            }
            loading={isLoading}
          />
        )}
        {withRecipe.length > 0 && (
          <Figure
            value={formatMinutes(minutes)}
            unit="in the kitchen"
            qualifier={
              withRecipe.length < planned.length
                ? `from ${withRecipe.length} of ${planned.length} meals`
                : undefined
            }
            loading={isLoading}
          />
        )}
        {isLoading && withRecipe.length === 0 && <span style={pending}>Adding up…</span>}
      </div>

      {!isLoading && (
        <div style={split}>
          {planned.map((slot) => {
            const { tint, ink } = mealTokens(slot.meal)
            const kcal = slot.recipe?.caloriesPerServing
            return (
              <span
                key={slot.meal}
                style={{
                  ...splitChip,
                  background: tint,
                  color: ink,
                  flexGrow: proportional ? (kcal ?? 0) : 1,
                }}
              >
                {kcal != null ? `${kcal.toLocaleString()} ${slot.meal.toLowerCase()}` : slot.meal.toLowerCase()}
              </span>
            )
          })}
        </div>
      )}

      {!isLoading && missing && missingTitles.length > 0 && (
        <p style={note}>
          {listTitles(missingTitles)} {missingTitles.length === 1 ? 'has' : 'have'} no calorie
          figure — add one on the recipe to count {missingTitles.length === 1 ? 'it' : 'them'}.
        </p>
      )}
    </section>
  )
}

/** One big number with its unit and, when it isn't whole, its denominator. */
function Figure({
  value,
  unit,
  qualifier,
  loading,
}: {
  value: string
  unit: string
  qualifier?: string
  loading: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={figure}>{loading ? '—' : value}</span>
        <span style={unitLabel}>{unit}</span>
      </span>
      {qualifier && !loading && <span style={denominator}>{qualifier}</span>}
    </div>
  )
}

/** "Shakshuka", "Shakshuka and ramen", "Shakshuka, ramen and 2 more". */
function listTitles(titles: string[]): string {
  if (titles.length === 1) return titles[0]
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const figures: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 20,
  flexWrap: 'wrap',
}

const figure: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const unitLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const denominator: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const pending: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
}

const split: CSSProperties = {
  display: 'flex',
  gap: 4,
}

const splitChip: CSSProperties = {
  flexBasis: 0,
  minWidth: 0,
  fontSize: 10,
  lineHeight: 1.3,
  fontWeight: 700,
  borderRadius: 6,
  padding: '3px 5px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontVariantNumeric: 'tabular-nums',
}

const note: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: 'var(--muted)',
  overflowWrap: 'anywhere',
}
