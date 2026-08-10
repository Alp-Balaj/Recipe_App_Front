// ─────────────────────────────────────────────────────────────────────────
// The week-scoped shopping-list projection (week/shopping rework, Task 5).
//
// A plain useQuery, deliberately NOT infinite: the new endpoint has no paging at
// all, because a week's list is bounded by the plan that produced it — and paging
// a list you are holding in a shop is worse than fetching the whole thing once.
//
// Ticking and hiding are optimistic for the same reason the retired
// useShoppingListMutations was: PUT /shopping-list/marks is an explicit full set
// of both flags, so a double-tap (or a retry) cannot land the overlay anywhere
// the user didn't ask for. The pattern below is that hook's, lifted:
// cancelQueries → snapshot → setQueryData → roll the snapshot back onError.
//
// The two delete verbs are NOT interchangeable, and the choice is the caller's:
//   · a Derived group is HIDDEN — setMark(..., isSuppressed: true);
//   · a Manual group is DELETED — DELETE /shopping-list/{manualItemId}.
// Sending isSuppressed:true for a `manual:` key is a 400 server-side, so the
// caller must read `origin` and pick. Never infer it from the key's shape.
// ─────────────────────────────────────────────────────────────────────────

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  addManualItem,
  deleteManualItem,
  getShoppingList,
  setMark,
  type ShoppingCarryoverItem,
  type ShoppingList,
  type ShoppingScope,
  type ShoppingWeek,
} from '@/api/shopping'

/**
 * One scope's projection. `weekStart` must be a UTC-midnight Monday for scope
 * 'Week' (a missing one is a 400); for scope 'All' pass null — the server picks
 * the weeks and ignores the parameter.
 *
 * `enabled` (trust rework, Task 8) is an additional opt-in gate, ANDed with the
 * scope/weekStart guard below — defaulted to `true` so both existing call
 * sites (the page's primary query, the two-argument hook test) are unaffected.
 * It exists for the other-weeks probe: `useShoppingWeek(null, 'All', total ===
 * 0 && scope === 'Week')`, which must not fire while the primary list is still
 * shopping-list-shaped (that would waste a request every time the list has rows).
 */
export function useShoppingWeek(weekStart: string | null, scope: ShoppingScope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.shopping.week(weekStart, scope),
    queryFn: ({ signal }) => getShoppingList({ weekStart, scope, signal }),
    // scope=Week without a week is the one request guaranteed to 400. Don't send it.
    enabled: (scope === 'All' || weekStart !== null) && enabled,
  })
}

/** Weeks arrive as '…T00:00:00Z' but are requested as '…T00:00:00.000Z' — compare instants. */
function sameWeek(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime()
}

/**
 * Re-derive a week's progress counters after a local edit, using the server's own
 * rule (`Count(g => g.IsPurchased)` / `Count`). Without this the "12 of 34" read
 * would disagree with the rows underneath it until the next refetch.
 */
function recount(week: ShoppingWeek): ShoppingWeek {
  return {
    ...week,
    purchasedCount: week.groups.filter((group) => group.isPurchased).length,
    totalCount: week.groups.length,
  }
}

/** Apply `edit` to one week's group list, leaving every other week untouched. */
function patchWeek(
  cache: ShoppingList | undefined,
  weekStartDate: string,
  edit: (week: ShoppingWeek) => ShoppingWeek,
): ShoppingList | undefined {
  if (!cache) return cache
  return {
    ...cache,
    weeks: cache.weeks.map((week) =>
      sameWeek(week.weekStartDate, weekStartDate) ? recount(edit(week)) : week,
    ),
  }
}

/**
 * The four writes, all keyed to ONE cached projection — pass the same
 * `weekStart`/`scope` pair given to `useShoppingWeek` (so `null` under scope
 * 'All'). Each mark carries its OWN group's week in the variables, because under
 * scope 'All' the visible groups span several weeks and the mark overlay is
 * keyed per week.
 */
export function useShoppingMutations(weekStart: string | null, scope: ShoppingScope) {
  const queryClient = useQueryClient()
  const listKey = queryKeys.shopping.week(weekStart, scope)

  /**
   * Mark the OTHER scope's projection stale, and deliberately NOT this one.
   *
   * Both scopes show the same groups, so a tick under 'Week' leaves the cached
   * 'All' projection wrong — and with a 30s staleTime (src/main.tsx) switching
   * scope within half a minute would show the row unticked again. Invalidating
   * the sibling fixes that for free: it is not mounted, so `invalidateQueries`
   * only flags it and the refetch happens when you switch to it.
   *
   * The current scope is left alone on purpose. Its cache is already correct
   * (the optimistic patch put it there), and refetching the list you are reading
   * on every single tick is the one thing this surface must not do — you are
   * standing in a shop on a phone signal.
   */
  const invalidateSiblingScope = () =>
    void queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'shopping' && query.queryKey[1] === 'week' && query.queryKey[3] !== scope,
    })

  /** cancel-in-flight → snapshot → optimistic patch, shared by both mark writes. */
  const beginOptimistic = async (edit: (cache: ShoppingList | undefined) => ShoppingList | undefined) => {
    await queryClient.cancelQueries({ queryKey: listKey })
    const snapshot = queryClient.getQueryData<ShoppingList>(listKey)
    queryClient.setQueryData<ShoppingList>(listKey, (cache) => edit(cache))
    return { snapshot }
  }

  const rollback = (_error: unknown, _vars: unknown, context: { snapshot?: ShoppingList } | undefined) => {
    if (context?.snapshot) queryClient.setQueryData(listKey, context.snapshot)
  }

  /** Tick or untick. Dims the row in place — the row itself never moves (design). */
  const setPurchased = useMutation({
    mutationFn: (vars: { weekStartDate: string; key: string; isPurchased: boolean }) =>
      setMark({ ...vars, isSuppressed: false }),
    onMutate: ({ weekStartDate, key, isPurchased }) =>
      beginOptimistic((cache) =>
        patchWeek(cache, weekStartDate, (week) => ({
          ...week,
          groups: week.groups.map((group) => (group.key === key ? { ...group, isPurchased } : group)),
        })),
      ),
    onError: rollback,
    onSettled: invalidateSiblingScope,
  })

  /**
   * Hide a DERIVED group for this week. The tick is carried along so hiding
   * something already bought doesn't silently untick it — the mark is a full set.
   */
  const suppress = useMutation({
    mutationFn: (vars: { weekStartDate: string; key: string; isPurchased: boolean }) =>
      setMark({ ...vars, isSuppressed: true }),
    onMutate: ({ weekStartDate, key }) =>
      beginOptimistic((cache) =>
        patchWeek(cache, weekStartDate, (week) => ({
          ...week,
          groups: week.groups.filter((group) => group.key !== key),
        })),
      ),
    onError: rollback,
    onSettled: invalidateSiblingScope,
  })

  /** Add a row of your own to a week. Invalidates — the server assigns the group key. */
  const addItem = useMutation({
    mutationFn: (item: { ingredient: string; quantity: string; weekStartDate: string }) =>
      addManualItem(item),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all }),
  })

  /** Delete a MANUAL row for real (there is nothing to suppress — the row goes). */
  const removeItem = useMutation({
    mutationFn: (vars: { weekStartDate: string; manualItemId: string }) =>
      deleteManualItem(vars.manualItemId),
    onMutate: ({ weekStartDate, manualItemId }) =>
      beginOptimistic((cache) =>
        patchWeek(cache, weekStartDate, (week) => ({
          ...week,
          groups: week.groups.filter((group) => group.manualItemId !== manualItemId),
        })),
      ),
    onError: rollback,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all }),
  })

  /** Un-hide a derived group (trust rework). No optimistic patch — only the server
      holds the group's full shape, so this invalidates and lets the refetch render it. */
  const restore = useMutation({
    mutationFn: (vars: { weekStartDate: string; key: string; isPurchased: boolean }) =>
      setMark({ ...vars, isSuppressed: false }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all }),
  })

  /**
   * Carry one of last week's unbought items into the current week: a manual row
   * here, then close it out there (hide a derived group, delete a manual row).
   * Sequential ON PURPOSE — if the add fails, last week's item is still owed and
   * must not vanish. No optimistic patch: the item lives in last week's carryover
   * block, not in either cached week's `groups`, so there is nothing local to
   * patch — the invalidation-driven refetch is what makes it disappear from the
   * banner and (if targeted at the viewed week) appear as a fresh manual row.
   */
  const carryItem = useMutation({
    mutationFn: async (vars: { item: ShoppingCarryoverItem; fromWeek: string; toWeek: string }) => {
      const { item, fromWeek, toWeek } = vars
      await addManualItem({
        ingredient: item.displayName,
        quantity: item.remainingDisplay ?? '',
        weekStartDate: toWeek,
      })
      if (item.origin === 'Manual' && item.manualItemId) await deleteManualItem(item.manualItemId)
      else await setMark({ weekStartDate: fromWeek, key: item.key, isPurchased: false, isSuppressed: true })
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all }),
  })

  /** Dismiss one of last week's unbought items without carrying it — the same
      Manual-vs-Derived close-out `carryItem` uses, minus the add. */
  const dismissCarryover = useMutation({
    mutationFn: async (vars: { item: ShoppingCarryoverItem; fromWeek: string }) => {
      const { item, fromWeek } = vars
      if (item.origin === 'Manual' && item.manualItemId) await deleteManualItem(item.manualItemId)
      else await setMark({ weekStartDate: fromWeek, key: item.key, isPurchased: false, isSuppressed: true })
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all }),
  })

  return { setPurchased, suppress, addItem, removeItem, restore, carryItem, dismissCarryover }
}
