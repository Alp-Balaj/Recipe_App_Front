// ─────────────────────────────────────────────────────────────────────────
// Computed nutrition and dietary-restriction findings (stream G, slice G4).
//
// Both come from the catalogue, and both are shown WITH their limits, which
// is the whole design. The horizon document cut "AI nutrition estimation" and
// kept this instead because a figure computed from published USDA values is a
// far more defensible thing than a number a model asserted — but that is only
// true if the coverage travels with it. A total computed from 3 of 11
// ingredients rendered as a bare "412 kcal" would be exactly the confident
// claim the AI version was cut for.
//
// The dietary panel reports CONFLICTS FOUND, never compliance. It says how
// many lines it could not check, because D8 guarantees unresolved ingredients
// will always exist and a clean result over a partly-unreadable recipe is not
// a safety guarantee. Nothing here says "safe", and nothing should.
// ─────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { DietaryRestriction } from '@/api/types'
import { label } from '@/api/vocabulary'

interface ComputedNutrition {
  kcalPerServing?: number | null
  proteinGPerServing?: number | null
  fatGPerServing?: number | null
  carbsGPerServing?: number | null
  fibreGPerServing?: number | null
  coveredLines: number
  totalLines: number
}

interface DietaryCheck {
  restriction: DietaryRestriction
  conflicts: { ingredientName: string; reason: string }[]
  uncheckableLines: number
}

interface RecipeInsightsResponse {
  nutrition: ComputedNutrition
  dietaryChecks: DietaryCheck[]
}

export default function RecipeInsights({ recipeId }: { recipeId: string }) {
  const { data } = useQuery({
    queryKey: ['recipes', recipeId, 'insights'],
    queryFn: () => apiFetch<RecipeInsightsResponse>(`/recipes/${recipeId}/insights`),
    // Insights are derived, never stored, so they are as fresh as the recipe —
    // but they are also nobody's critical path. A failure renders nothing.
    retry: false,
  })

  if (!data) return null

  const { nutrition, dietaryChecks } = data
  const hasNutrition = nutrition.kcalPerServing != null && nutrition.coveredLines > 0
  if (!hasNutrition && dietaryChecks.length === 0) return null

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {hasNutrition && (
        <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{nutrition.kcalPerServing}</span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>kcal per serving, from the ingredients</span>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5, color: 'var(--muted)' }}>
            {nutrition.proteinGPerServing != null && <span>Protein {nutrition.proteinGPerServing} g</span>}
            {nutrition.fatGPerServing != null && <span>Fat {nutrition.fatGPerServing} g</span>}
            {nutrition.carbsGPerServing != null && <span>Carbs {nutrition.carbsGPerServing} g</span>}
            {nutrition.fibreGPerServing != null && <span>Fibre {nutrition.fibreGPerServing} g</span>}
          </div>

          {/* The coverage line is not optional garnish — see the header. */}
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>
            {nutrition.coveredLines === nutrition.totalLines
              ? `Computed from all ${nutrition.totalLines} ingredients.`
              : `Computed from ${nutrition.coveredLines} of ${nutrition.totalLines} ingredients — the rest could not be measured.`}
          </div>
        </div>
      )}

      {dietaryChecks.map((check) => {
        const clean = check.conflicts.length === 0
        return (
          <div
            key={check.restriction}
            style={{
              background: 'var(--surface2)',
              borderRadius: 14,
              padding: '12px 14px',
              borderLeft: `3px solid ${clean ? 'var(--accent)' : 'var(--danger, #c0392b)'}`,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{label(check.restriction)}</div>

            {clean ? (
              // "No conflicts found", NOT "safe". The wording is the honesty.
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                No conflicting ingredients found.
              </div>
            ) : (
              <ul style={{ margin: '5px 0 0', paddingLeft: 16, fontSize: 12.5, color: 'var(--muted)' }}>
                {check.conflicts.map((c) => (
                  <li key={c.ingredientName}>
                    {c.ingredientName} — {c.reason}
                  </li>
                ))}
              </ul>
            )}

            {check.uncheckableLines > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>
                {check.uncheckableLines} ingredient{check.uncheckableLines === 1 ? '' : 's'} could not be
                checked — not in the catalogue.
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
