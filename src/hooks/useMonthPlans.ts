// ─────────────────────────────────────────────────────────────────────────
// Every plan a month grid touches (meal-plan redesign, month PR).
//
// GET /meal-plans has cursor / limit / weekStart and no date RANGE filter, so
// a month can't be asked for directly. The list is keyset-paged newest-first,
// which at least means the weeks in view are near the front: page until the
// oldest week returned is older than the grid's first day, then stop.
//
// Each week in view that HAS a plan then needs its entries for the day chips —
// one GET /meal-plans/{id} apiece, up to six. Those share
// queryKeys.mealPlans.detail(id) with the day page and the board, so a month
// you've been working in is largely warm already.
//
// Cook time rides along on the summary now (backend 849595b): MealPlanSummary
// carries totalMinutes beside entryCount, summed server-side per entry. That
// was the change this hook asked for — the alternative was a GET /recipes/{id}
// per entry, up to 21 a week and 100+ a month, and a partial total would have
// quietly under-reported. It costs no extra round trip here.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getMealPlan, getMealPlans, type MealPlanEntry, type MealPlanSummary } from '@/api/mealPlans'
import { formatPlanDate } from '@/lib/planDates'

/** Stop paging the plan list after this many pages, whatever happens. */
const MAX_PAGES = 4
const PAGE_SIZE = 50

export interface WeekSummary {
  /** "2026-07-27" — the Monday this week starts on. */
  weekStart: string
  planId?: string
  entryCount: number
  /** Prep + cook across the week, from the summary. 0 when the week has no plan. */
  totalMinutes: number
  entries: MealPlanEntry[]
  /**
   * How many DIFFERENT dishes fill those entries, counted by recipe id — two
   * recipes that happen to share a title are two dishes.
   *
   * This replaced a "×3 repeat" warning. The warning only fired past a
   * threshold, so a week of three dishes cooked twice each — obviously
   * repetitive — scored a clean rail. The ratio against entryCount says the
   * same thing continuously and never goes quiet.
   */
  distinctDishes: number
}

async function fetchPlansCovering(oldestNeeded: string, signal?: AbortSignal): Promise<MealPlanSummary[]> {
  const out: MealPlanSummary[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await getMealPlans({ cursor, limit: PAGE_SIZE, signal })
    out.push(...response.items)

    // Newest-first, so once a page ends older than the grid we have them all.
    const oldest = response.items[response.items.length - 1]
    if (!response.nextCursor) break
    if (oldest && formatPlanDate(new Date(oldest.weekStartDate)) < oldestNeeded) break
    cursor = response.nextCursor
  }

  return out
}

/**
 * @param weekStarts the Monday of every row in the grid, as "YYYY-MM-DD"
 */
export function useMonthPlans(weekStarts: string[]) {
  const oldestNeeded = weekStarts[0] ?? ''

  const list = useQuery({
    queryKey: [...queryKeys.mealPlans.list(), 'covering', oldestNeeded],
    queryFn: ({ signal }) => fetchPlansCovering(oldestNeeded, signal),
    enabled: weekStarts.length > 0,
  })

  /** weekStart → the summary for that week, for the weeks actually on screen. */
  const inView = useMemo(() => {
    const wanted = new Set(weekStarts)
    const map = new Map<string, MealPlanSummary>()
    for (const summary of list.data ?? []) {
      const key = formatPlanDate(new Date(summary.weekStartDate))
      if (wanted.has(key)) map.set(key, summary)
    }
    return map
  }, [list.data, weekStarts])

  // Only weeks that have a plan need their entries fetched.
  const planned = useMemo(() => [...inView.entries()], [inView])

  const details = useQueries({
    queries: planned.map(([, summary]) => ({
      queryKey: queryKeys.mealPlans.detail(summary.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getMealPlan(summary.id, signal),
    })),
  })

  return useMemo(() => {
    const entriesByPlan = new Map<string, MealPlanEntry[]>()
    for (const result of details) {
      if (result.data) entriesByPlan.set(result.data.id, result.data.entries)
    }

    const byWeek = new Map<string, WeekSummary>()
    for (const weekStart of weekStarts) {
      const summary = inView.get(weekStart)
      const entries = summary ? (entriesByPlan.get(summary.id) ?? []) : []

      byWeek.set(weekStart, {
        weekStart,
        planId: summary?.id,
        entryCount: summary?.entryCount ?? 0,
        totalMinutes: summary?.totalMinutes ?? 0,
        entries,
        distinctDishes: new Set(entries.map((entry) => entry.recipe.id)).size,
      })
    }

    return {
      byWeek,
      isLoading: list.isLoading || details.some((d) => d.isLoading),
      isError: list.isError,
    }
  }, [weekStarts, inView, details, list.isLoading, list.isError])
}
