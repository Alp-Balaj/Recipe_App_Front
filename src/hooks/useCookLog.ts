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
  updateCookNote,
  type CookLogEntry,
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

export function useCookLogMutations() {
  const queryClient = useQueryClient()

  // Four caches learn something from one cook, and the shopping one is the point of this
  // feature: cooking a meal can resolve a group, and a list that still asks you to buy what
  // you already ate is the exact distrust this work exists to remove.
  //
  // `queryKeys.shopping.all` is the PREFIX every scoped week key is built from — see
  // queryKeys.shopping.week(). Aiming at anything narrower would miss the scope=All view.
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cookLog.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.feed.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all })
  }

  /**
   * Records a cook. Pass the plan entry id when the gesture happened on a plan
   * surface — it cannot be recovered later.
   *
   * Do NOT also call useSocialMutations().logCooked for the same gesture: the
   * server bumps the aggregate as part of this write, and firing both counts
   * the cook twice.
   */
  const log = useMutation({
    mutationFn: (vars: { recipeId: string; mealPlanEntryId?: string | null }) =>
      logCook(vars.recipeId, vars.mealPlanEntryId),
    onSuccess: invalidate,
  })

  /**
   * Undoes a plan cook. Ungated on purpose — the mark gesture is offered only on a
   * day that has happened, but an undo the user cannot reach is the bug this whole
   * roadmap exists to fix.
   */
  const unlog = useMutation({
    mutationFn: (vars: { mealPlanEntryId: string }) => uncookEntry(vars.mealPlanEntryId),
    onSuccess: invalidate,
  })

  /**
   * Sets or clears a note. Increments nothing — see api/cookLog.updateCookNote.
   *
   * Only the cook-log caches are touched: no counter moved, so the social
   * caches have learned nothing and invalidating them would be a refetch for
   * no reason.
   */
  const saveNote = useMutation({
    mutationFn: (vars: { id: string; note: string | null }) => updateCookNote(vars.id, vars.note),
    onSuccess: (updated: CookLogEntry) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cookLog.all })
      return updated
    },
  })

  return { log, unlog, saveNote }
}
