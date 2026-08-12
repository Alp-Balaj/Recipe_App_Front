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
  type UncookResponse,
} from '@/api/cookLog'
import { applyCookedState } from './useSocialMutations'

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
   * KAN-18 — the un-log half of the invalidation above, and it cannot BE an
   * invalidation.
   *
   * Since KAN-13 "you cooked this" means `timesCooked > 0`, so removing the last
   * cook flips it. The feed cards heal on their own (the list above refetches
   * them); the per-recipe social envelope does not, and cannot: it is seeded once
   * with `staleTime: Infinity`, and its queryFn's first act is to read its own
   * cached entry back and return it unchanged when the entry is fully known. So
   * adding `queryKeys.social.envelopes` to `invalidate` marks the entry stale,
   * re-runs the function, and changes nothing — the shape of fix that looks right
   * and is a no-op. The entry has to be WRITTEN.
   *
   * What that stale flag actually breaks, today, is NOT a screen: nothing renders
   * `envelope.cookedByMe` — RecipeDetailPage does not read it, and FeedRail's flag
   * comes off feed items (checked 2026-08-12). It reaches `isFullyKnown()`, which
   * decides whether the F1 fallback fetches at all, so a wrong-but-non-null flag
   * suppresses the one request that could have corrected it and hands itself to
   * the next surface that reads the entry. See ADR-0006's "What this is NOT".
   *
   * Written from the server's answer, through the same `applyCookedState` the
   * rating retract uses, rather than re-derived here from the cook count: the
   * derivation belongs to the server and the SPA prefers a patch over a later
   * read, so a locally-derived flag would overwrite the correct value and outlive
   * the fetch that should have healed it (KAN-12, ADR-0005, ADR-0006).
   *
   * An empty `recipes` means nothing was written — the idempotent entry-scoped
   * repeat — so there is deliberately nothing to patch.
   *
   * `result?.recipes ?? []` because a deploy is not atomic: an SPA holding this
   * code against an API still on the old 204 gets `undefined` from apiFetch
   * (204/empty body → undefined), and an unguarded `result.recipes` throws INSIDE
   * onSuccess. React Query counts that as a failed mutation, so a delete that
   * really happened is reported to the user as "Couldn't undo that" — and the
   * invalidation below never runs, leaving the deleted cook on screen. Patch
   * nothing, invalidate anyway: that is exactly the pre-KAN-18 behaviour, which is
   * the right thing to degrade to when talking to a pre-KAN-18 server.
   */
  const applyUncooked = (result: UncookResponse | undefined) => {
    for (const row of result?.recipes ?? []) {
      applyCookedState(queryClient, row)
    }
    invalidate()
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
    // The other half of KAN-18, and it only became reachable BECAUSE of KAN-18.
    //
    // Un-logging now writes `cookedByMe: false` into an envelope entry that never
    // refetches, and useSocialEnvelope's merge is `latest.cookedByMe ?? wire...` —
    // a written false beats the server. So "un-tick a slot, tick it again" left the
    // entry stuck on false: this write is the one that has to take it back. Before
    // un-log wrote anything, the entry stayed (wrongly) true and a re-cook made it
    // accidentally right.
    //
    // `true` from the gesture rather than from a server field, which the sibling
    // `useSocialMutations.logCooked` has always done: POST /cook-log answers with
    // the LOG row and carries no aggregate. This is not the derivation ADR-0006
    // forbids — that one reads a count the client is holding and re-applies a rule
    // it does not own. "A cook was just accepted, so the caller has cooked this" is
    // true under the current rule and under the two it replaced. The tidier fix is
    // the aggregate on this reply too; recorded as a follow-up rather than smuggled
    // into KAN-18.
    onSuccess: (_row, vars) => {
      applyCookedState(queryClient, { recipeId: vars.recipeId, cookedByMe: true })
      invalidate()
    },
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
    // KAN-18 reached this gesture too, and it had been wrong here for longer: the
    // day page's tick is the OLDER of the two un-logs, and it started leaving the
    // recipe page stale the moment KAN-13 redefined the flag — independently of
    // KAN-14's row-scoped sibling below.
    onSuccess: applyUncooked,
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
    onSuccess: applyUncooked,
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
