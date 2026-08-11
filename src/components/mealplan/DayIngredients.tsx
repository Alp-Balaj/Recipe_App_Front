// ─────────────────────────────────────────────────────────────────────────
// Everything the day's meals need, grouped BY DISH (meal-plan redesign).
//
// Grouped, never merged — a deliberate decision, not an unfinished one:
//
//  1. This surface is read while cooking, and you cook one dish at a time.
//  2. Merging needs unit conversion ("1 tsp cumin" + "5 g cumin"), which is
//     right most of the time and silently wrong the rest.
//  3. The backend already decided: MealPlanService.GenerateShoppingListAsync
//     is documented "no aggregation, no unit conversion" (v1 semantics #1) and
//     emits one row per recipe-ingredient. A merged view here would give the
//     same user two different answers to the same question.
//
// So overlap is SHOWN, not performed: an ingredient appearing in more than one
// of the day's dishes is marked, and the header names them. Nobody claims to
// know what two chopping styles of garlic add up to.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { MEAL_ORDER, type MealTypeName } from '@/api/mealPlans'
import type { RecipeIngredient } from '@/api/types'
import { formatQuantity } from '@/pages/recipeVisuals'
import { mealTokens } from './MealCard'

export interface IngredientGroup {
  meal: MealTypeName
  /**
   * The planned recipe's title, or null when nothing is planned for this meal.
   *
   * A meal whose recipe is WITHHELD (see `withheld`) is planned and has no title, so it
   * carries a placeholder rather than null — null here means "this slot is free", and
   * `planned` below counts on that.
   */
  title: string | null
  ingredients: RecipeIngredient[]
  /** Planned, but its detail didn't load — say so rather than showing nothing. */
  unavailable?: boolean
  /**
   * KAN-1: planned, but the recipe was removed or is no longer shared with the caller, so
   * its ingredients are not ours to show. Deliberately distinct from `unavailable`, which
   * means a fetch that failed and will succeed on a retry — this one never will, and
   * telling the user to try again would be a lie.
   */
  withheld?: boolean
}

interface Props {
  groups: IngredientGroup[]
  /** Details still in flight — the list is incomplete, so don't total it yet. */
  isLoading?: boolean
}

/** Ingredient names (normalised) that appear in more than one of the day's dishes. */
function findOverlap(groups: IngredientGroup[]): Map<string, string> {
  const groupsPerName = new Map<string, { label: string; count: number }>()
  for (const group of groups) {
    // A name repeated WITHIN one recipe isn't an overlap, so count each group once.
    const seen = new Set<string>()
    for (const ingredient of group.ingredients) {
      const key = ingredient.name.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      const existing = groupsPerName.get(key)
      if (existing) existing.count += 1
      else groupsPerName.set(key, { label: ingredient.name.trim(), count: 1 })
    }
  }

  const overlap = new Map<string, string>()
  for (const [key, { label, count }] of groupsPerName) {
    if (count > 1) overlap.set(key, label)
  }
  return overlap
}

export default function DayIngredients({ groups, isLoading = false }: Props) {
  const planned = groups.filter((g) => g.title !== null)
  // The footer counts the dishes it actually LISTED, so a withheld meal (KAN-1) is not one
  // of them — "2 items across 3 dishes" would have the reader hunting for a third. It still
  // counts as `planned` above, which is what keeps "Nothing planned yet" off a day whose
  // only meal is withheld.
  const listedDishes = planned.filter((g) => !g.withheld).length
  const overlap = findOverlap(groups)
  const totalItems = groups.reduce((sum, g) => sum + g.ingredients.length, 0)

  const overlapNote = (() => {
    const labels = [...overlap.values()]
    if (labels.length === 0) return null
    const list =
      labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
    return `${list} appear${labels.length === 1 ? 's' : ''} in more than one dish`
  })()

  return (
    <section style={card} aria-label="What you'll need today">
      <div style={header}>
        <h2 style={heading}>What you'll need today</h2>
        {overlapNote && <span style={note}>{overlapNote}</span>}
      </div>

      {MEAL_ORDER.map((meal) => {
        const group = groups.find((g) => g.meal === meal)
        if (!group) return null
        const { ink } = mealTokens(meal)

        return (
          <div key={meal} style={groupBlock}>
            <div style={groupHead}>
              <span style={{ ...groupMeal, color: ink }}>{meal}</span>
              <span style={groupTitle}>
                {group.title ?? 'not chosen yet'}
              </span>
              <span style={rule} />
            </div>

            {group.withheld && (
              <div style={quietLine}>
                This meal&rsquo;s recipe is no longer available, so its ingredients aren&rsquo;t here.
              </div>
            )}

            {group.title !== null && !group.withheld && group.unavailable && (
              <div style={quietLine}>Couldn't load this recipe's ingredients.</div>
            )}

            {group.ingredients.length > 0 && (
              <div style={list}>
                {group.ingredients.map((ingredient, index) => {
                  const shared = overlap.has(ingredient.name.trim().toLowerCase())
                  return (
                    <div key={`${ingredient.name}-${index}`} style={row}>
                      <span style={{ ...ingredientName, ...(shared ? { color: 'var(--accent)' } : {}) }}>
                        {ingredient.name}
                      </span>
                      {shared && (
                        <span style={sharedMark} aria-label="also needed by another dish">
                          ↕
                        </span>
                      )}
                      <span style={quantity}>{formatQuantity(ingredient.quantity, ingredient.unit)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div style={footer}>
        {isLoading
          ? 'Loading ingredients…'
          : planned.length === 0
            ? 'Nothing planned yet — pick a meal above and this fills in.'
            : listedDishes === 0
              ? 'Nothing to list for this day.'
              : `${totalItems} ${totalItems === 1 ? 'item' : 'items'} across ${listedDishes} ${
                  listedDishes === 1 ? 'dish' : 'dishes'
                }`}
      </div>
    </section>
  )
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
}

const heading: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  margin: 0,
}

const note: CSSProperties = {
  fontSize: 12,
  color: 'var(--accent)',
  fontWeight: 700,
  marginLeft: 'auto',
}

const groupBlock: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
}

const groupHead: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
}

const groupMeal: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  flexShrink: 0,
}

const groupTitle: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const rule: CSSProperties = {
  flex: 1,
  height: 1,
  background: 'var(--hair)',
  minWidth: 12,
}

const list: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
  gap: '2px 20px',
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 13.5,
  padding: '2px 0',
  minWidth: 0,
}

const ingredientName: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const sharedMark: CSSProperties = {
  fontSize: 10,
  color: 'var(--accent)',
  flexShrink: 0,
}

const quantity: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

const quietLine: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
}

const footer: CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: 12,
  fontSize: 12.5,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}
