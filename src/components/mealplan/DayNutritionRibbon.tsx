// ─────────────────────────────────────────────────────────────────────────
// What the day's ingredients actually add up to (stream I — D12's second
// surface, after recipe detail).
//
// This sits directly under DayTotals, and the pair is the whole point. DayTotals
// shows what the AUTHORS said; this shows what the CATALOGUE computes. Two
// different questions, two different answers, and the interesting moment is when
// they disagree — which is exactly why this never replaces, overwrites or
// silently corrects the typed figure. It is labelled "from the ingredients" and
// it stays in its own card.
//
// Both are counted the same way — one serving per planned meal — because two
// numbers side by side are an invitation to compare them, and comparing figures
// counted differently is worse than showing one.
//
// D12's floor is the other half of the design. Below the covered-lines threshold
// the day renders as INCOMPLETE rather than as a number: an undercounted calorie
// total does not look uncertain, it looks like a light day. The server decides
// the threshold (isSufficientlyCovered) so the recipe page, this ribbon and
// anything later cannot drift apart on what "enough" means.
//
// One request per plan, not per meal. A failure renders nothing at all — this is
// derived, additional, and nobody's critical path.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getMealPlanNutrition, type DayNutrition } from '@/api/planNutrition'
import type { DayName } from '@/api/mealPlans'

interface Props {
  /** Null while the week has no plan yet — nothing is planned, so nothing is computed. */
  planId: string | null
  day: DayName
  /** Meals planned on this day, from the page's own entries. */
  plannedMeals: number
}

export default function DayNutritionRibbon({ planId, day, plannedMeals }: Props) {
  const { data } = useQuery({
    // DERIVED from the plan's detail key rather than invented beside it, and
    // rather than added to the frozen factory: nesting under it means every
    // invalidation the page already fires after adding, swapping or removing a
    // meal cascades in here for free. A sibling key would have gone stale the
    // first time somebody planned a dinner.
    queryKey: [...queryKeys.mealPlans.detail(planId ?? 'none'), 'nutrition'],
    queryFn: ({ signal }) => getMealPlanNutrition(planId!, signal),
    enabled: planId !== null && plannedMeals > 0,
    // Derived from the plan and the catalogue, never stored, and not on any
    // critical path — a failure is silence, not an error state (the same posture
    // RecipeInsights takes on recipe detail).
    retry: false,
  })

  // Nothing planned is not a zero — it is a day with no question to answer.
  if (plannedMeals === 0) return null

  const today = data?.days?.find((entry) => entry.dayOfWeek === day)
  if (!today) return null

  return (
    <section style={card} aria-label="Computed nutrition for this day">
      <div style={head}>
        <span style={label}>From the ingredients</span>
        <span style={denominator}>{coverageShort(today)}</span>
      </div>

      {today.isSufficientlyCovered && today.kcal != null ? (
        <>
          <div style={figures}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={figure}>{today.kcal.toLocaleString()}</span>
              <span style={unitLabel}>kcal</span>
            </span>
            <div style={macros}>
              {today.proteinG != null && <span>Protein {today.proteinG} g</span>}
              {today.fatG != null && <span>Fat {today.fatG} g</span>}
              {today.carbsG != null && <span>Carbs {today.carbsG} g</span>}
              {today.fibreG != null && <span>Fibre {today.fibreG} g</span>}
            </div>
          </div>

          {/* The coverage line is not garnish — see the header. */}
          <p style={note}>{coverageSentence(today)}</p>
        </>
      ) : (
        // D12: below the floor this is a hole, and it is shown as one. No number,
        // because a number here would be read as the day's calories rather than as
        // the fraction of them anybody could count.
        <p style={note}>
          {today.coveredLines === 0
            ? "None of today's ingredients are in the catalogue, so there is nothing to add up yet."
            : `Only ${today.coveredLines} of ${today.totalLines} ingredient lines could be measured — too few to total the day honestly.`}{' '}
          The figures above are what the recipe authors typed.
        </p>
      )}
    </section>
  )
}

/** "9 of 11 lines" — the denominator, in the corner, always. */
function coverageShort(day: DayNutrition): string {
  return `${day.coveredLines} of ${day.totalLines} lines`
}

function coverageSentence(day: DayNutrition): string {
  const meals = day.entryCount === 1 ? 'meal' : 'meals'
  return day.coveredLines === day.totalLines
    ? `Computed from all ${day.totalLines} ingredient lines across ${day.entryCount} ${meals}, one serving each.`
    : `Computed from ${day.coveredLines} of ${day.totalLines} ingredient lines across ${day.entryCount} ${meals}, one serving each — the rest could not be measured.`
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const head: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
}

const label: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const denominator: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const figures: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 16,
  flexWrap: 'wrap',
}

const figure: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--text)',
  fontVariantNumeric: 'tabular-nums',
}

const unitLabel: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const macros: CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  fontSize: 12.5,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const note: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  color: 'var(--muted)',
  overflowWrap: 'anywhere',
}
