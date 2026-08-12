// ─────────────────────────────────────────────────────────────────────────
// The cook log's reads and writes (plan-page redesign / roadmap spec 2).
//
// Two reads of different SHAPES — a single latest row, and an infinite history
// — which is why writes invalidate `queryKeys.cookLog.all` rather than patching
// through a shared prefix. The feed redesign's cache-key bug came from a patcher
// that assumed one shape and silently no-op'd on the other; there is no shared
// shape here to assume.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  getCookLog,
  getLatestCook,
  logCook,
  uncookEntry,
  unlogCook,
  updateCookNote,
  type CookLogEntry,
  type PastCookFields,
} from '@/api/cookLog'

/** The newest cook + the lifetime total — everything /plan's §3 card renders. */
export function useLatestCook() {
  return useQuery({
    queryKey: queryKeys.cookLog.latest(),
    queryFn: ({ signal }) => getLatestCook(signal),
  })
}

/** The full history, newest first — /plan/cooks. */
export function useCookHistory() {
  return useInfiniteQuery({
    queryKey: queryKeys.cookLog.list(),
    queryFn: ({ pageParam, signal }) =>
      getCookLog({ cursor: pageParam as string | undefined, limit: 20, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

/**
 * One dish's cooks, newest first — /cooked/:recipeId (KAN-5).
 *
 * The same read as `useCookHistory` with the recipe filter on it, under its own
 * cache key: the two lists hold the same SHAPE but different sets, and sharing
 * a key would let a dish page's single-dish pages answer /plan/cooks.
 */
export function useDishCooks(recipeId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.cookLog.list(recipeId),
    queryFn: ({ pageParam, signal }) =>
      getCookLog({ cursor: pageParam as string | undefined, limit: 20, recipeId, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })
}

export function useCookLogMutations() {
  const queryClient = useQueryClient()

  // Four caches learn something from one cook, and the shopping one is the point of this
  // feature: cooking a meal can resolve a group, and a list that still asks you to buy what
  // you already ate is the exact distrust this work exists to remove.
  //
  // `queryKeys.shopping.all` is the PREFIX every scoped week key is built from — see
  // queryKeys.shopping.week(). Aiming at anything narrower would miss the scope=All view.
  //
  // KAN-4 adds a fifth, and it is the ONE that must be RESET rather than
  // invalidated. Cooked is keyed on (LastCookedAt, RecipeId) and a cook CHANGES
  // LastCookedAt — unlike every other keyset list in this app, whose sort key
  // (SavedAt, CreatedAt) is written once and never moves.
  //
  // Invalidate refetches each loaded page from the cursor it was originally
  // fetched with. Move a dish to the top and every later page shifts by one, so
  // the dish that slid across a page boundary is fetched by neither: with pages
  // [A,B] and [C,D], cooking D re-reads page 1 as [D,A] and page 2 from the
  // stored cursor(B) as [C] — B is simply gone from the list until a remount.
  // Reset drops the stored cursors and starts again from page 1, which is also
  // where the just-cooked dish now is.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cookLog.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.feed.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all })
    void queryClient.resetQueries({ queryKey: queryKeys.cooked.all })
  }

  /**
   * Records a cook. Pass the plan entry id when the gesture happened on a plan
   * surface — it cannot be recovered later.
   *
   * Do NOT also call useSocialMutations().logCooked for the same gesture: the
   * server bumps the aggregate as part of this write, and firing both counts
   * the cook twice.
   */
  // `networkMode: 'always'` — see useSocialMutations.ts's note on `logCooked`
  // for the full story. Same failure mode applies here: cook mode's finish
  // panel and MealCard's "I cooked this" both call through this mutation, and
  // a paused-offline mutation with no resume leaves the user believing they
  // logged a cook that never landed, with no error and no retry offered.
  //
  // KAN-6's backdated cook goes through THIS mutation rather than a second one,
  // and the reset above is why that matters rather than being tidiness: a cook
  // dated two years ago changes TimesCooked, FirstCookedAt and possibly the
  // dish's note without moving LastCookedAt at all. A dish that stays put is the
  // case a narrower cache update is most likely to miss, because nothing about
  // the list's ORDER changed to make the staleness visible.
  const log = useMutation({
    networkMode: 'always',
    mutationFn: (vars: {
      recipeId: string
      mealPlanEntryId?: string | null
      past?: PastCookFields
    }) => logCook(vars.recipeId, vars.mealPlanEntryId, vars.past),
    onSuccess: invalidate,
  })

  /**
   * Undoes a plan cook. Ungated on purpose — the mark gesture is offered only on a
   * day that has happened, but an undo the user cannot reach is the bug this whole
   * roadmap exists to fix.
   */
  // `networkMode: 'always'` — see useSocialMutations.ts's note on `logCooked`.
  // The undo path is reached from the same surfaces as `log` above and would
  // otherwise silently pause offline instead of failing loudly.
  const unlog = useMutation({
    networkMode: 'always',
    mutationFn: (vars: { mealPlanEntryId: string }) => uncookEntry(vars.mealPlanEntryId),
    onSuccess: invalidate,
  })

  /**
   * Un-logs ONE cook — the row-scoped undo (KAN-14), for a cook that satisfied
   * no plan slot and therefore has no entry id for `unlog` above to name.
   *
   * Same invalidation as the other two, including the Cooked RESET rather than an
   * invalidate: removing a cook can take a dish off the list entirely, and every
   * stored cursor after it shifts by one — the mirror of the argument logging a
   * cook makes above.
   *
   * The server does NOT forgive a repeat (a deleted row is a 404, unlike an
   * already-empty plan slot), so the surface must disable its control while this
   * is pending rather than leaning on idempotence.
   */
  // `networkMode: 'always'` — see useSocialMutations.ts's note on `logCooked`.
  // Same reasoning as its two neighbours: a paused-offline delete would leave the
  // user believing a mis-tapped cook was taken back when nothing was sent.
  const unlogOne = useMutation({
    networkMode: 'always',
    mutationFn: (vars: { id: string }) => unlogCook(vars.id),
    onSuccess: invalidate,
  })

  /**
   * Sets or clears a note. Increments nothing — see api/cookLog.updateCookNote.
   *
   * The social caches are still deliberately left alone: no counter moved, so
   * the feed and the shopping list have learned nothing and invalidating them
   * would be a refetch for no reason.
   *
   * The PLAN cache is the exception, and it was not one until KAN-8 (this used
   * to invalidate the cook log alone). GET /meal-plans now reports
   * `cookNoteCount` per entry, and the day page's un-cook toggle reads it to
   * decide whether to confirm before deleting the slot's cooks. Writing a note
   * therefore changes what that read says. Production staleTime is 30s
   * (main.tsx), so leaving it out means "write a note, go back to the day,
   * un-tick" is answered from a cached count of 0 — no dialog, note gone: the
   * exact silent destruction the confirmation exists to prevent.
   */
  const saveNote = useMutation({
    mutationFn: (vars: { id: string; note: string | null }) => updateCookNote(vars.id, vars.note),
    onSuccess: (updated: CookLogEntry) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cookLog.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all })
      // KAN-4, on the same terms as the plan cache above: no counter moved, but
      // Cooked's row shows the dish's latest NON-EMPTY note, so writing one —
      // or clearing one, which promotes the note before it — changes what this
      // read says.
      //
      // Invalidate, NOT the reset the cook paths use: annotating a cook moves no
      // dish and adds no row, so every stored cursor still points where it did.
      // Resetting here would throw away a reader's loaded pages for a change of
      // text on a row they can already see.
      void queryClient.invalidateQueries({ queryKey: queryKeys.cooked.all })
      return updated
    },
  })

  return { log, unlog, unlogOne, saveNote }
}
