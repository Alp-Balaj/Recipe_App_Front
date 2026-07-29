// ─────────────────────────────────────────────────────────────────────────
// The recipe picker's corpus (meal-plan redesign, picker PR).
//
// Why this exists at all: GET /recipes takes cuisine / difficulty / tags and
// nothing else — there is NO text search on the server (RecipeEndpoints.cs).
// Discover works around that by filtering the pages it happens to have loaded,
// which means typing a dish name only finds it if you already scrolled to it.
//
// A picker can't live with that, because the common case is someone who
// already knows what they want. So the three PERSONAL lists — saved, your own,
// recently planned — are fetched whole (each capped) and searched in memory:
// instant, no debounce, no round trip, and rankable by your own cooking
// history in a way a ?search= parameter could not be. Everyone's public
// recipes stay paged, because that list has no bound worth prefetching.
//
// Known limitation, inherited not introduced: there is no server-side "mine",
// so own-recipes are scanned out of the global list and filtered by author —
// exactly what MyRecipesPage.tsx:62 does, and lossy in the same way past the
// cap. A real /recipes/mine endpoint would fix both at once.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { getSavedRecipes } from '@/api/social'
import { getMealPlan, getMealPlans, type DayName, type MealTypeName } from '@/api/mealPlans'
import type { RecipeIngredient, RecipeListResponse, RecipeResponse } from '@/api/types'

/** Page sizes and caps — bounded so "fetch it all" can never run away. */
const SAVED_PAGE = 50
const SAVED_CAP = 150
const SCAN_PAGE = 50
const SCAN_CAP = 200
const HISTORY_PLANS = 4

/** One candidate, merged from every source that knows about it. */
export interface PickerRecipe {
  id: string
  title: string
  imageUrl?: string | null
  /** Present when a full RecipeResponse was available (saved / mine / browse). */
  totalTimeMinutes?: number
  servings?: number
  /**
   * Also present from any list endpoint: GET /recipes and the saved list both
   * project through RecipeMapper.ToResponse, exactly like the detail route, so
   * ingredients ride along at no extra cost. That is what makes the picker able
   * to say what a dish would add to the day's shopping.
   */
  ingredients?: RecipeIngredient[]
  isSaved: boolean
  isMine: boolean
  /** The week start of the most recent plan this appeared in, if any. */
  lastPlannedWeek?: string
}

export type PickerSegment = 'again' | 'saved' | 'mine' | 'all'

/** Every page of the caller's saves, to a cap. */
async function fetchAllSaved(signal?: AbortSignal): Promise<RecipeResponse[]> {
  const out: RecipeResponse[] = []
  let cursor: string | undefined
  while (out.length < SAVED_CAP) {
    const page = await getSavedRecipes({ cursor, limit: SAVED_PAGE, signal })
    out.push(...page.items)
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return out
}

/** Scan the global list for the caller's own recipes, to a cap. */
async function fetchMine(userId: string, signal?: AbortSignal): Promise<RecipeResponse[]> {
  const out: RecipeResponse[] = []
  let scanned = 0
  let cursor: string | undefined
  while (scanned < SCAN_CAP) {
    const page: RecipeListResponse = await apiFetch<RecipeListResponse>('/recipes', {
      query: { cursor, limit: SCAN_PAGE },
      signal,
    })
    scanned += page.items.length
    out.push(...page.items.filter((r) => r.createdByUserId === userId))
    if (!page.nextCursor) break
    cursor = page.nextCursor
  }
  return out
}

export interface PlannedBefore {
  id: string
  title: string
  imageUrl?: string | null
  weekStart: string
}

/** Recipes from the most recent plans, newest week first. */
async function fetchHistory(signal?: AbortSignal): Promise<PlannedBefore[]> {
  const page = await getMealPlans({ limit: HISTORY_PLANS, signal })
  const plans = await Promise.all(
    page.items.map((summary) =>
      getMealPlan(summary.id, signal)
        .then((plan) => ({ weekStart: summary.weekStartDate, plan }))
        .catch(() => null),
    ),
  )

  const seen = new Map<string, PlannedBefore>()
  for (const entry of plans) {
    if (!entry) continue
    for (const item of entry.plan.entries) {
      // Plans arrive newest first, so the first sighting is the most recent.
      if (seen.has(item.recipe.id)) continue
      seen.set(item.recipe.id, {
        id: item.recipe.id,
        title: item.recipe.title,
        imageUrl: item.recipe.imageUrl,
        weekStart: entry.weekStart,
      })
    }
  }
  return [...seen.values()]
}

export interface PickerCorpus {
  /** Every personally-known recipe, merged across sources. */
  byId: Map<string, PickerRecipe>
  /** Candidates for one segment, already ordered. */
  forSegment: (segment: PickerSegment) => PickerRecipe[]
  counts: Record<Exclude<PickerSegment, 'all'>, number>
  isLoading: boolean
}

/**
 * @param userId  the signed-in user, for the own-recipes scan
 * @param enabled fetch only while the picker is actually open
 */
export function usePickerCorpus(userId: string | undefined, enabled: boolean): PickerCorpus {
  const saved = useQuery({
    queryKey: queryKeys.picker.saved(),
    queryFn: ({ signal }) => fetchAllSaved(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const mine = useQuery({
    queryKey: queryKeys.picker.mine(userId ?? ''),
    queryFn: ({ signal }) => fetchMine(userId!, signal),
    enabled: enabled && !!userId,
    staleTime: 5 * 60 * 1000,
  })

  const history = useQuery({
    queryKey: queryKeys.picker.history(),
    queryFn: ({ signal }) => fetchHistory(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  return useMemo(() => {
    const byId = new Map<string, PickerRecipe>()

    // A later source may only ADD to what an earlier one knew — never blank a
    // field it filled. History carries no times, so it must not erase them.
    const upsert = (id: string, patch: Partial<PickerRecipe> & Pick<PickerRecipe, 'title'>) => {
      const prior = byId.get(id)
      byId.set(id, {
        id,
        title: patch.title || prior?.title || '',
        imageUrl: patch.imageUrl ?? prior?.imageUrl,
        totalTimeMinutes: patch.totalTimeMinutes ?? prior?.totalTimeMinutes,
        servings: patch.servings ?? prior?.servings,
        ingredients: patch.ingredients ?? prior?.ingredients,
        lastPlannedWeek: patch.lastPlannedWeek ?? prior?.lastPlannedWeek,
        isSaved: Boolean(patch.isSaved || prior?.isSaved),
        isMine: Boolean(patch.isMine || prior?.isMine),
      })
    }

    for (const recipe of saved.data ?? []) {
      upsert(recipe.id, {
        title: recipe.title,
        imageUrl: recipe.imageUrl,
        totalTimeMinutes: recipe.totalTimeMinutes,
        servings: recipe.servings,
        ingredients: recipe.ingredients,
        isSaved: true,
      })
    }
    for (const recipe of mine.data ?? []) {
      upsert(recipe.id, {
        title: recipe.title,
        imageUrl: recipe.imageUrl,
        totalTimeMinutes: recipe.totalTimeMinutes,
        servings: recipe.servings,
        ingredients: recipe.ingredients,
        isMine: true,
      })
    }
    for (const planned of history.data ?? []) {
      upsert(planned.id, {
        title: planned.title,
        imageUrl: planned.imageUrl,
        lastPlannedWeek: planned.weekStart,
      })
    }

    const all = [...byId.values()]
    const again = all
      .filter((r) => r.lastPlannedWeek)
      .sort((a, b) => b.lastPlannedWeek!.localeCompare(a.lastPlannedWeek!))
    const savedList = all.filter((r) => r.isSaved)
    const mineList = all.filter((r) => r.isMine)

    return {
      byId,
      counts: { again: again.length, saved: savedList.length, mine: mineList.length },
      forSegment: (segment: PickerSegment) => {
        if (segment === 'again') return again
        if (segment === 'saved') return savedList
        if (segment === 'mine') return mineList
        return all
      },
      isLoading: saved.isLoading || mine.isLoading || history.isLoading,
    }
  }, [saved.data, saved.isLoading, mine.data, mine.isLoading, history.data, history.isLoading])
}

/** Case-insensitive substring match over the title — the corpus is small. */
export function matchesQuery(recipe: PickerRecipe, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return recipe.title.toLowerCase().includes(q)
}

/** "3 weeks ago" / "last week" / "this week", from a plan's week start. */
export function plannedAgo(weekStart: string, now = new Date()): string {
  const then = new Date(weekStart).getTime()
  const weeks = Math.floor((now.getTime() - then) / (7 * 24 * 60 * 60 * 1000))
  if (weeks <= 0) return 'planned this week'
  if (weeks === 1) return 'planned last week'
  return `planned ${weeks} weeks ago`
}

/** Short day label for a duplicate warning, e.g. "Tue". */
export function shortDayLabel(day: DayName): string {
  return day.slice(0, 3)
}

/**
 * What choosing this dish would mean for the day's shopping — either that it
 * reuses something already needed, or how many new items it adds.
 *
 * `alreadyNeeded` holds normalised names, and the overlap test is the same
 * plain name match DayIngredients uses. No quantities are combined here: the
 * backend generator is documented "no aggregation, no unit conversion", and a
 * picker that quietly did arithmetic the shopping list won't do would be
 * telling the user two different stories.
 */
export function shoppingConsequence(
  recipe: PickerRecipe,
  alreadyNeeded: ReadonlySet<string>,
): string | null {
  if (!recipe.ingredients) return null

  const names = new Set(
    recipe.ingredients.map((i) => i.name.trim().toLowerCase()).filter(Boolean),
  )
  if (names.size === 0) return null

  const shared = [...names].filter((name) => alreadyNeeded.has(name))
  if (shared.length > 0) {
    const label = recipe.ingredients.find(
      (i) => i.name.trim().toLowerCase() === shared[0],
    )?.name
    return shared.length === 1 ? `uses ${label} ✓` : `reuses ${shared.length} items ✓`
  }

  return `+${names.size} ${names.size === 1 ? 'item' : 'items'}`
}

export type { DayName, MealTypeName }
