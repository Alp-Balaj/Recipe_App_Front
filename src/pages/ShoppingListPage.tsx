// ─────────────────────────────────────────────────────────────────────────
// Shopping-list surface (/shopping-list) — shop redesign, direction 1c:
// AISLE-FIRST, WITH DISH PROVENANCE.
//
// The list is still a PROJECTION of a week (see useShoppingWeek): one row per
// ingredient, ticks held in a mark overlay so they survive any later plan edit.
// What the redesign changes is what the rows are ORGANISED by, and it is not a
// cosmetic change — it is the difference between a list you read at a table and a
// list you walk a shop with.
//
//  · AISLES lead. The projection names the aisle (from the ingredient catalogue's
//    category), and the groups arrive in walk order, so the page's job is to group
//    consecutive aisles and never re-sort them.
//  · Every row still says which DISH and which DAY it serves, in one small italic
//    line. That is the thing an ingredient-led list normally loses.
//  · BUY-ONCE: a shared ingredient appears exactly once, filed under the week's
//    first dish that needs it, naming the others. Decided server-side — `parts[0]`
//    is the owner.
//  · There is NO separate shop mode. One list plans at home and ticks in the
//    aisle, so the scanner sits on the list itself rather than behind a finish
//    screen, and ticked rows still DIM IN PLACE and never reorder.
//
// Selection is one model with two doors: a long-press on touch, and the aisle
// header's checkbox (or shift-click) on desktop, which is why desktop needs no
// long-press at all. It acts through the SAME two writes as a single row — there
// is no bulk endpoint, and inventing one to save N requests would have bought a
// second code path for the two verbs that must never be confused.
//
// The delete verbs are unchanged and still not interchangeable: a Derived group is
// SUPPRESSED for the week (the plan would recreate it), a Manual row is DELETED.
// The page reads `origin` to choose — never the key's shape.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { weekStartOf } from '@/api/mealPlans'
import type { ShoppingGroup, ShoppingScope } from '@/api/shopping'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { sameWeek, useShoppingMutations, useShoppingWeek } from '@/hooks/useShoppingWeek'
import AllBought from '@/components/shopping/AllBought'
import CarryoverBanner from '@/components/shopping/CarryoverBanner'
import EmptyWeekExplainer from '@/components/shopping/EmptyWeekExplainer'
import UnavailableRecipesNotice from '@/components/shopping/UnavailableRecipesNotice'
import ManualAddForm from '@/components/shopping/ManualAddForm'
import SectionHeading from '@/components/shopping/SectionHeading'
import { ProgressBar, ScopePills, SegmentedToggle } from '@/components/shopping/ShoppingControls'
import ShoppingRail from '@/components/shopping/ShoppingRail'
import ShoppingRow from '@/components/shopping/ShoppingRow'
import { ReceiptIcon } from '@/components/shopping/shopIcons'
import {
  SelectionBulkBar,
  SelectionHeaderBar,
  SelectionNote,
} from '@/components/shopping/SelectionBars'
import {
  aisleSummaries,
  describeSelection,
  dishSummaries,
  isDone,
  itemsOf,
  sectionsOf,
  weekRange,
  type GroupBy,
  type ShoppingItem,
} from '@/components/shopping/shoppingModel'
import StateBlock from '@/components/ui/StateBlock'

const SCOPES: { value: ShoppingScope; label: string }[] = [
  { value: 'Week', label: 'This week' },
  { value: 'All', label: 'All' },
]

const GROUPINGS: { value: GroupBy; label: string }[] = [
  { value: 'aisle', label: 'By aisle' },
  { value: 'dish', label: 'By dish' },
]

/** Step a UTC-Monday ISO string by whole weeks — the only week math this page does. */
function addWeeks(week: string, count: number): string {
  const date = new Date(week)
  date.setUTCDate(date.getUTCDate() + count * 7)
  return date.toISOString()
}

export default function ShoppingListPage() {
  const [scope, setScope] = useState<ShoppingScope>('Week')
  const [groupBy, setGroupBy] = useState<GroupBy>('aisle')
  const [hideBought, setHideBought] = useState(false)
  /** The exact orphan set the reader has already dismissed — a new one banners again. */
  const [dismissedOrphans, setDismissedOrphans] = useState<string | null>(null)
  const [selection, setSelection] = useState<ReadonlySet<string>>(() => new Set())
  /** Anchor for shift-click ranges. */
  const lastClicked = useRef<string | null>(null)
  const [currentAisle, setCurrentAisle] = useState<string | null>(null)

  // Two thresholds, because they answer different questions. 1024 is the shell's
  // own desktop breakpoint — above it there is a sidebar, a mouse, and therefore
  // hover actions instead of swipe. 1180 is where the RAIL earns its 328px: below
  // that the list column would drop under the design's 720px reading width, so
  // the rail goes and its progress read moves into the header.
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const hasRail = useMediaQuery('(min-width: 1180px)')
  const compact = !isDesktop

  const listRef = useRef<HTMLDivElement | null>(null)
  /** Mounted section blocks in DOM order, for the rail's aisle jump. */
  const sectionRefs = useRef(new Map<string, { aisle: string; element: HTMLDivElement }>())

  // This route has no week parameter, so "this week" means the current one. It is
  // also the week a manual row goes to under either scope: under 'All' there is no
  // single scoped week, and the week you are shopping for is this one.
  //
  // Deliberately NOT memoised on []. Pinning it at mount means a session left open
  // across Monday 00:00 UTC keeps asking for last week and files manual adds into
  // it — the same time-coupling that quietly broke the day-page tests.
  const currentWeek = weekStartOf(new Date())
  // The viewed week is stored as an OFFSET from `currentWeek`, not an absolute
  // date — a plain useState(currentWeek) would freeze at whatever `currentWeek`
  // was at mount, reintroducing exactly the time-coupling the comment above
  // warns about (a session left open across Monday 00:00 UTC would keep showing
  // last week once stepping is possible). An offset re-derives against the live
  // `currentWeek` every render, so "not stepped away" keeps following the clock,
  // and only an explicit Previous/Next/This-week action changes what is shown.
  const [weekOffset, setWeekOffset] = useState(0)
  const viewedWeek = weekOffset === 0 ? currentWeek : addWeeks(currentWeek, weekOffset)
  // scope 'All' IGNORES weekStart server-side, and the cache key says so by
  // holding null — the two scopes are genuinely different projections.
  const scopedWeek = scope === 'Week' ? viewedWeek : null

  const { data, isLoading, isError } = useShoppingWeek(scopedWeek, scope)
  const { setPurchased, suppress, addItem, removeItem, restore, carryItem, dismissCarryover } =
    useShoppingMutations(scopedWeek, scope)
  /** True only while a Carry-all/Dismiss-all batch is walking its items — see
      onCarryAll/onDismissAll below for why this isn't read off the mutations'
      own `isPending` alone. */
  const [carryoverBatchPending, setCarryoverBatchPending] = useState(false)

  const weeks = useMemo(() => data?.weeks ?? [], [data])
  const total = weeks.reduce((sum, week) => sum + week.totalCount, 0)
  // Summed across every week on screen, not read off weeks[0]: under scope=All the page
  // renders several, and a withdrawn recipe planned in the second one is just as missing.
  const unavailableRecipeCount = weeks.reduce(
    (sum, week) => sum + (week.diagnostics?.unavailableRecipeCount ?? 0),
    0,
  )

  // The other-weeks probe (trust rework, Task 8): once the viewed week is
  // confirmed empty, ask scope 'All' whether some OTHER week still owes
  // something — the reason the list looks empty may be "you're looking at the
  // wrong week." Gated on `!isLoading` too, not just `total === 0`: `total`
  // starts at 0 before the primary fetch resolves (weeks defaults to []), and
  // without the loading guard this query would fire on every single mount —
  // including every non-empty week — for the instant before data arrives.
  const probeEnabled = !isLoading && total === 0 && scope === 'Week'
  const otherWeeksQuery = useShoppingWeek(null, 'All', probeEnabled)
  const otherWeeks = useMemo(() => {
    if (!otherWeeksQuery.data) return []
    return otherWeeksQuery.data.weeks
      // Compare INSTANTS, not raw strings: the probe's weeks arrive as
      // '…T00:00:00Z' while `viewedWeek` is client-built via .toISOString()
      // ('…T00:00:00.000Z') — the same hazard `sameWeek` already guards for the
      // mark-overlay cache patches below. A `!==` here would let the viewed
      // week leak into "other weeks still owing" under a Week/All query race.
      .filter((week) => !sameWeek(week.weekStartDate, viewedWeek) && week.totalCount - week.purchasedCount > 0)
      .map((week) => ({ weekStartDate: week.weekStartDate, unboughtCount: week.totalCount - week.purchasedCount }))
  }, [otherWeeksQuery.data, viewedWeek])

  const orphans = data?.orphanedPurchasedNames ?? []
  const showOrphans = orphans.length > 0 && orphans.join('|') !== dismissedOrphans

  /** Every visible row, in server order, across every week on the page. */
  const allItems = useMemo(() => weeks.flatMap(itemsOf), [weeks])
  // Composed here rather than read off week.purchasedCount, which counts TICKS only and
  // deliberately still does: folding resolutions into a shipped server number would
  // silently redefine it. "Done" is the client's composition — see shoppingModel.isDone.
  //
  // Two counts, not one, and they feed DIFFERENT things — do not fold them back together:
  //  · `purchased` is the isDone composition (bought || resolved). Spec-correct for every
  //    counter that must not still ask for a meal you already ate: the progress ribbon, the
  //    percentage, and "Hide bought (N)".
  //  · `tickedCount` counts ONLY the explicit tick — it feeds `allBought` alone. The receipt
  //    screen below replaces the whole list, rows AND the manual-add form, with a celebration
  //    asserting the shop is done. Cooking the week's one dish resolves its group without the
  //    user ever having shopped, and celebrating that would be a screen asserting something
  //    false with no way to add an item. Only ticking earns the receipt.
  const purchased = allItems.filter(isDone).length
  const tickedCount = allItems.filter((item) => item.bought).length
  const visibleItems = useMemo(
    () => (hideBought ? allItems.filter((item) => !isDone(item)) : allItems),
    [allItems, hideBought],
  )

  /** Grouped per week, because under scope 'All' each week is its own block. */
  const weekBlocks = useMemo(
    () =>
      weeks
        .map((week) => ({
          week,
          sections: sectionsOf(
            visibleItems.filter((item) => item.weekStartDate === week.weekStartDate),
            groupBy,
          ),
        }))
        .filter((block) => block.sections.length > 0),
    [weeks, visibleItems, groupBy],
  )

  /** Rail summaries read the WHOLE list, not the filtered view — "13 left" must
      not change because you hid the bought rows. */
  const aisles = useMemo(() => aisleSummaries(allItems), [allItems])
  const dishes = useMemo(() => dishSummaries(allItems), [allItems])

  /**
   * Per-week done counts for the scope=All block headers, computed the same way the
   * page-level `purchased` is — via `isDone` over that week's items — never off
   * `week.purchasedCount`, which is the wire's ticks-only number. shoppingModel.ts
   * exists precisely so the page's counters cannot disagree, and a resolved-not-ticked
   * row used to make the block header read "0 of 2" while the page header (isDone-based)
   * read "1 of 2" for the exact same week.
   *
   * Built from `allItems`, not `visibleItems`: a hidden (isDone) row must still be
   * counted here, and under "Hide bought" `visibleItems` has already dropped it.
   */
  const doneCountByWeek = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of allItems) {
      if (!isDone(item)) continue
      counts.set(item.weekStartDate, (counts.get(item.weekStartDate) ?? 0) + 1)
    }
    return counts
  }, [allItems])

  const selected = useMemo(
    () => visibleItems.filter((item) => selection.has(item.id)),
    [visibleItems, selection],
  )
  const selectionMode = selected.length > 0
  const flatSections = useMemo(() => weekBlocks.flatMap((block) => block.sections), [weekBlocks])
  const selectionDescription = describeSelection(selected, flatSections, selection)

  // A selection can outlive the rows it held — a refetch, a scope switch, or the
  // rows being hidden. Dropping the vanished ids keeps "Tick 5" from meaning three.
  useEffect(() => {
    setSelection((current) => {
      if (current.size === 0) return current
      const live = new Set(visibleItems.map((item) => item.id))
      const kept = [...current].filter((id) => live.has(id))
      return kept.length === current.size ? current : new Set(kept)
    })
  }, [visibleItems])

  // ── writes ──────────────────────────────────────────────────────────────
  const tick = useCallback(
    (item: ShoppingItem, isPurchased: boolean) =>
      setPurchased.mutate({ weekStartDate: item.weekStartDate, key: item.key, isPurchased }),
    [setPurchased],
  )

  /**
   * Suppress a Derived group, delete a Manual one. The tick rides along on the
   * suppression because the mark is an explicit full set of both flags — dropping
   * it would untick something on its way out.
   */
  const remove = useCallback(
    (weekStartDate: string, group: ShoppingGroup) => {
      if (group.origin === 'Manual') {
        // A Manual group without its row id can only be a server bug; a suppression
        // for its `manual:` key is a guaranteed 400, so send nothing at all.
        if (group.manualItemId) removeItem.mutate({ weekStartDate, manualItemId: group.manualItemId })
        return
      }
      suppress.mutate({ weekStartDate, key: group.key, isPurchased: group.isPurchased })
    },
    [removeItem, suppress],
  )

  /**
   * Un-hide a suppressed Derived group, into the week currently being viewed.
   *
   * `isPurchased` is the hidden group's OWN tick, carried back from the diagnostics entry
   * (`ShoppingHiddenItem.isPurchased`) rather than assumed. A mark is an explicit full set
   * of both flags, so this write has to state one — and hard-coding `false` here was the
   * mirror image of the bug `remove` above already avoids: tick Onion bought, hide it, then
   * Restore, and the row came back UNTICKED and you bought a second onion (spec §3.1).
   */
  const onRestore = useCallback(
    (key: string, isPurchased: boolean) =>
      restore.mutate({ weekStartDate: viewedWeek, key, isPurchased }),
    [restore, viewedWeek],
  )

  /**
   * Carry-all / dismiss-all walk the carryover items ONE AT A TIME, awaited —
   * deliberately NOT the brief's `forEach` firing N concurrent mutation chains.
   *
   * Each chain is independent (distinct keys/manualItemIds can't clobber one
   * another), so nothing here is a correctness bug either way. What tipped it:
   * a single `useMutation` only tracks ONE call's state at a time, so N
   * concurrent `.mutate()`s would make `carryItem.isPending` flicker false the
   * instant the FIRST of the N chains settles — with 9 more still in flight,
   * `disabled={isPending}` would go dark early and let a second batch or a
   * lone item click fire mid-batch. Walking sequentially with `mutateAsync`
   * keeps exactly one chain in flight, so `isPending` (or the explicit batch
   * flag below, for the gap between one chain settling and the next starting)
   * stays true for the batch's whole duration. It also caps a "Carry all" on a
   * dozen items at one add/close-out pair in flight rather than a burst of
   * twelve, and a failed item stops the walk instead of leaving a fan-out of
   * settled/failed promises to reconcile.
   */
  const onCarryAll = useCallback(async () => {
    const carryover = data?.carryover
    if (!carryover) return
    setCarryoverBatchPending(true)
    try {
      for (const item of carryover.items) {
        await carryItem.mutateAsync({ item, fromWeek: carryover.weekStartDate, toWeek: currentWeek })
      }
    } catch {
      // Stop the walk. The failing item's own error now lands on carryItem.error,
      // which the banner reads (its `isError` prop below) — this catch exists only
      // to keep the loop from throwing an unhandled rejection into the click handler.
    } finally {
      setCarryoverBatchPending(false)
    }
  }, [data?.carryover, carryItem, currentWeek])

  const onDismissAll = useCallback(async () => {
    const carryover = data?.carryover
    if (!carryover) return
    setCarryoverBatchPending(true)
    try {
      for (const item of carryover.items) {
        await dismissCarryover.mutateAsync({ item, fromWeek: carryover.weekStartDate })
      }
    } catch {
      // Stop the walk. The failing item's own error now lands on dismissCarryover.error,
      // which the banner reads (its `isError` prop below) — this catch exists only
      // to keep the loop from throwing an unhandled rejection into the click handler.
    } finally {
      setCarryoverBatchPending(false)
    }
  }, [data?.carryover, dismissCarryover])

  /**
   * The other-weeks probe hands over an ABSOLUTE UTC-Monday ISO string, but the
   * viewed week is stored as an OFFSET from the live `currentWeek` (see the
   * comment above `weekOffset`'s declaration) — there is no absolute
   * "viewedWeek" state to set directly. Converting back to an offset: both
   * timestamps are UTC-midnight Mondays, so their difference is an exact
   * multiple of a week: rounding (rather than truncating) keeps a DST-adjacent
   * week from landing half a week off due to any floating-point slop in the ms
   * arithmetic.
   */
  const onJumpToWeek = useCallback(
    (weekStartDate: string) => {
      const msPerWeek = 7 * 24 * 60 * 60 * 1000
      const weeksFromNow = Math.round((new Date(weekStartDate).getTime() - new Date(currentWeek).getTime()) / msPerWeek)
      setWeekOffset(weeksFromNow)
    },
    [currentWeek],
  )

  const clearSelection = useCallback(() => setSelection(new Set()), [])

  const tickSelection = useCallback(() => {
    selected.forEach((item) => tick(item, true))
    clearSelection()
  }, [selected, tick, clearSelection])

  const removeSelection = useCallback(() => {
    selected.forEach((item) => remove(item.weekStartDate, item.group))
    clearSelection()
  }, [selected, remove, clearSelection])

  // ── selection ───────────────────────────────────────────────────────────
  const toggleSelected = useCallback(
    (item: ShoppingItem, extend: boolean) => {
      setSelection((current) => {
        const next = new Set(current)

        // Shift-click takes everything between the anchor and here, in the order
        // the list is currently rendered — which is why the range walks
        // `visibleItems` rather than the raw projection.
        if (extend && lastClicked.current) {
          const from = visibleItems.findIndex((candidate) => candidate.id === lastClicked.current)
          const to = visibleItems.findIndex((candidate) => candidate.id === item.id)
          if (from >= 0 && to >= 0) {
            const [start, end] = from < to ? [from, to] : [to, from]
            for (let index = start; index <= end; index += 1) next.add(visibleItems[index].id)
            return next
          }
        }

        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        return next
      })
      lastClicked.current = item.id
    },
    [visibleItems],
  )

  const toggleSection = useCallback((items: ShoppingItem[]) => {
    setSelection((current) => {
      const next = new Set(current)
      const allIn = items.every((item) => next.has(item.id))
      items.forEach((item) => (allIn ? next.delete(item.id) : next.add(item.id)))
      return next
    })
  }, [])

  // The keyboard equivalents the rail advertises. Bound only while a selection is
  // held: ⌘A on a page with no selection belongs to the browser, and stealing
  // Backspace from a list nobody is selecting in would be hostile.
  useEffect(() => {
    if (!selectionMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.key === 'Escape') clearSelection()
      else if (event.key === 'Enter') tickSelection()
      else if (event.key === 'Backspace' || event.key === 'Delete') removeSelection()
      else if (event.key.toLowerCase() === 'a' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSelection(new Set(visibleItems.map((item) => item.id)))
      } else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectionMode, clearSelection, tickSelection, removeSelection, visibleItems])

  // ── aisle jump ──────────────────────────────────────────────────────────
  // scrollTop, never scrollIntoView: the list column is a scroll container inside
  // a fixed shell, and scrollIntoView would scroll the nearest scrollable ANCESTOR
  // too — dragging the whole app frame under the sidebar.
  const jumpToAisle = useCallback((aisle: string) => {
    const container = listRef.current
    const section = [...sectionRefs.current.values()].find((entry) => entry.aisle === aisle)
    if (!container || !section) return
    container.scrollTop = section.element.offsetTop - container.offsetTop
    setCurrentAisle(aisle)
  }, [])

  const onListScroll = useCallback(() => {
    const container = listRef.current
    if (!container) return
    let current: string | null = null
    for (const { aisle, element } of sectionRefs.current.values()) {
      if (element.offsetTop - container.offsetTop <= container.scrollTop + 8) current = aisle
    }
    setCurrentAisle(current)
  }, [])

  // Offline is "the fetch failed but we still hold a list". With nothing cached
  // there is nothing to be stale about, so that is a plain error instead.
  const offline = isError && data !== undefined
  // Ticks only — see tickedCount's definition above. `purchased` (isDone) would
  // let a fully-resolved, never-shopped week trigger the receipt screen.
  const allBought = total > 0 && tickedCount === total
  const percent = total === 0 ? 0 : Math.round((purchased / total) * 100)

  // ── pieces shared by both layouts ───────────────────────────────────────
  const scanButton = (
    <Link to="/scan?mode=receipt" style={scanStyle}>
      <ReceiptIcon size={17} />
      <span style={{ fontSize: compact ? 13 : 13.5, fontWeight: 800 }}>Scan receipt</span>
    </Link>
  )

  const hideBoughtButton = purchased > 0 && (
    <button type="button" onClick={() => setHideBought((hidden) => !hidden)} style={hideBoughtStyle}>
      {hideBought ? 'Show' : 'Hide'} bought ({purchased})
    </button>
  )

  // Only scope 'Week' has a single viewed week to step — under 'All' every week
  // owing is already on the page, so there is nothing here to switch between.
  const weekSwitcher = scope === 'Week' && (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        aria-label="Previous week"
        style={weekArrow}
        onClick={() => setWeekOffset((offset) => offset - 1)}
      >
        ‹
      </button>
      {weekOffset !== 0 && (
        <button type="button" style={backToNow} onClick={() => setWeekOffset(0)}>
          This week
        </button>
      )}
      <button
        type="button"
        aria-label="Next week"
        style={weekArrow}
        onClick={() => setWeekOffset((offset) => offset + 1)}
      >
        ›
      </button>
    </span>
  )

  const banners = (
    <>
      {/* sameWeek, not `===`: ONE week-equality rule in this file. Both operands happen to
          be client-built today, so a raw string compare is correct by accident — but the
          probe above already had to be fixed for exactly this ('…T00:00:00Z' from the server
          never equals the client's '…T00:00:00.000Z'), and a future path that seeds a week
          from a server string must not reintroduce the bug 300 lines from where it was
          fixed. */}
      {scope === 'Week' && sameWeek(viewedWeek, currentWeek) && data?.carryover && (
        <CarryoverBanner
          carryover={data.carryover}
          isPending={carryItem.isPending || dismissCarryover.isPending || carryoverBatchPending}
          isError={carryItem.isError || dismissCarryover.isError}
          onCarry={(item) =>
            carryItem.mutate({ item, fromWeek: data.carryover!.weekStartDate, toWeek: currentWeek })
          }
          onDismiss={(item) => dismissCarryover.mutate({ item, fromWeek: data.carryover!.weekStartDate })}
          onCarryAll={onCarryAll}
          onDismissAll={onDismissAll}
        />
      )}

      {showOrphans && (
        <div style={banner}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700 }}>
              {orphans.length === 1
                ? "1 thing you'd already bought is no longer in your plan."
                : `${orphans.length} things you'd already bought are no longer in your plan.`}
            </span>{' '}
            <span style={{ color: 'var(--muted)' }}>{orphans.join(', ')}</span>
          </span>
          <button type="button" style={bannerButton} onClick={() => setDismissedOrphans(orphans.join('|'))}>
            Dismiss
          </button>
        </div>
      )}

      {offline && (
        <div style={banner}>
          <span>You're offline — your ticks will sync when you're back.</span>
        </div>
      )}

      {/* KAN-1: in the BANNERS, not in the empty state — a shortened list needs the
          explanation more than an empty one does, and it used to be the only case that
          never got it. Renders nothing at zero. */}
      <UnavailableRecipesNotice count={unavailableRecipeCount} />
    </>
  )

  const states = (
    <>
      {isLoading && <StateBlock title="Loading your list…" />}

      {!isLoading && isError && !offline && (
        <StateBlock title="Couldn't load your list" body="Check your connection and try again." />
      )}

      {/* `sameWeek` on isCurrentWeek for the same reason as the carryover gate above — one
          week-equality rule in this file, not two. */}
      {!isLoading && !(isError && !offline) && total === 0 && (
        <EmptyWeekExplainer
          weekLabel={weekRange(viewedWeek)}
          isCurrentWeek={scope !== 'Week' || sameWeek(viewedWeek, currentWeek)}
          diagnostics={weeks[0]?.diagnostics}
          otherWeeks={otherWeeks}
          onRestore={onRestore}
          onJumpToWeek={onJumpToWeek}
        />
      )}

    </>
  )
  // There is deliberately no "everything is bought" state block here any more.
  // The only way to empty the list while it still has rows is to hide the bought
  // ones — which means every row is bought — and that case is now the AllBought
  // screen below, not a one-line placeholder.

  /** The rows themselves — identical markup at both breakpoints, different metrics. */
  const list = weekBlocks.map((block) => (
    <section key={block.week.weekStartDate} style={{ marginBottom: 14 }}>
      {/* One week needs no label — the scope control already said which. */}
      {scope === 'All' && (
        <h2 style={weekLabel}>
          {weekRange(block.week.weekStartDate)}
          <span style={{ fontWeight: 600, color: 'var(--muted)' }}>
            {' '}
            · {doneCountByWeek.get(block.week.weekStartDate) ?? 0} of {block.week.totalCount}
          </span>
        </h2>
      )}

      {block.sections.map((section, index) => {
        const selectedHere = section.items.filter((item) => selection.has(item.id))
        return (
          <div
            key={`${block.week.weekStartDate}:${section.id}`}
            // Keyed per WEEK and section, not per aisle: under scope 'All' the
            // same aisle heads a block in every week, and one shared key would
            // leave the rail's "Produce" jumping to whichever week rendered last.
            // The jump resolves the first match instead — see jumpToAisle.
            //
            // The arrow is recreated every render, so React clears and re-runs it
            // each time; the map is therefore rebuilt in DOM order rather than
            // accumulating stale nodes.
            ref={(element) => {
              const id = `${block.week.weekStartDate}:${section.id}`
              if (element) sectionRefs.current.set(id, { aisle: section.id, element })
              else sectionRefs.current.delete(id)
            }}
            style={{ marginTop: index === 0 ? 0 : compact ? 14 : 20 }}
          >
            <SectionHeading
              section={section}
              compact={compact}
              allSelected={section.items.length > 0 && selectedHere.length === section.items.length}
              selectionMode={selectionMode}
              selectedCount={selectedHere.length}
              onToggleSection={() => toggleSection(section.items)}
            />
            {section.items.map((item) => (
              <ShoppingRow
                key={item.id}
                item={item}
                groupBy={groupBy}
                compact={compact}
                gestures={compact}
                selectionMode={selectionMode}
                selected={selection.has(item.id)}
                onToggleBought={(isPurchased) => tick(item, isPurchased)}
                onRemove={() => remove(item.weekStartDate, item.group)}
                onSelect={(extend) => toggleSelected(item, extend)}
                onLongPress={() => toggleSelected(item, false)}
              />
            ))}
          </div>
        )
      })}
    </section>
  ))

  const addForm = (
    <ManualAddForm
      // Under 'All' there is no single viewed week, so a manual add still targets
      // `currentWeek` — exactly as before this page could step at all.
      onAdd={(item) =>
        addItem.mutateAsync({ ...item, weekStartDate: scope === 'Week' ? viewedWeek : currentWeek })
      }
      isPending={addItem.isPending}
      isError={addItem.isError}
      compact={compact}
    />
  )

  const finished = allBought && (
    <AllBought
      total={total}
      range={scope === 'Week' ? weekRange(viewedWeek) : null}
      aisles={aisles}
      nextDish={dishes[0] ?? null}
      compact={compact}
    />
  )

  // ── desktop: header, reading column, rail ───────────────────────────────
  if (isDesktop) {
    return (
      <div style={desktopFrame}>
        {selectionMode ? (
          <SelectionHeaderBar
            count={selected.length}
            description={selectionDescription}
            onTick={tickSelection}
            onRemove={removeSelection}
            onCancel={clearSelection}
          />
        ) : (
          <div style={desktopHeader}>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrow}>SHOPPING LIST</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={desktopTitle}>
                  {scope === 'Week' ? weekRange(viewedWeek) : 'Every week still owing'}
                </h1>
                {weekSwitcher}
              </div>
            </div>

            <SegmentedToggle
              options={GROUPINGS}
              value={groupBy}
              onChange={setGroupBy}
              label="How to group the list"
            />
            <ScopePills options={SCOPES} value={scope} onChange={setScope} label="Which weeks to show" />

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Without the rail the progress read has nowhere else to live, so it
                  comes into the header rather than being dropped. */}
              {!hasRail && total > 0 && (
                <span style={headerProgress}>
                  <span style={srOnly}>Bought </span>
                  {purchased} of {total}
                </span>
              )}
              {hideBoughtButton}
              {scanButton}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div ref={listRef} className="scroll" style={listColumn} onScroll={onListScroll}>
            <div style={{ maxWidth: 720 }}>
              {banners}
              {finished || (
                <>
                  {!isLoading && total > 0 && <div style={{ marginBottom: 18 }}>{addForm}</div>}
                  {states}
                  {list}
                </>
              )}
            </div>
          </div>

          {hasRail && total > 0 && !allBought && (
            <ShoppingRail
              purchased={purchased}
              total={total}
              aisles={aisles}
              dishes={dishes}
              currentAisle={currentAisle}
              onJumpToAisle={jumpToAisle}
              selected={selected}
              selectionDescription={selectionDescription}
            />
          )}
        </div>
      </div>
    )
  }

  // ── mobile: one column, tab bar below (or the bulk bar in its place) ────
  return (
    <>
      <div className="scroll" style={{ ...mobileFrame, bottom: selectionMode ? 88 : 'var(--nav-h, 74px)' }}>
        {selectionMode ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 600 }}>
                {selected.length} selected
              </div>
              <button type="button" onClick={clearSelection} style={mobileCancel}>
                Cancel
              </button>
            </div>
            <SelectionNote description={selectionDescription} />
          </>
        ) : (
          <>
            {/* Hidden once the shop is done: the finished screen below is its own
                header, and repeating "Shopping list · 21 of 21" above "Everything's
                ticked · 21 of 21" says the same thing twice in two voices. */}
            {!allBought && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h1 style={mobileTitle}>Shopping list</h1>
                {weekSwitcher}
                {total > 0 && (
                  <span style={mobileProgress}>
                    <span style={srOnly}>Bought </span>
                    {purchased} of {total}
                  </span>
                )}
              </div>
            )}

            {!allBought && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SegmentedToggle
                    options={GROUPINGS}
                    value={groupBy}
                    onChange={setGroupBy}
                    compact
                    label="How to group the list"
                  />
                  <div style={{ marginLeft: 'auto' }}>
                    <ScopePills
                      options={SCOPES}
                      value={scope}
                      onChange={setScope}
                      compact
                      label="Which weeks to show"
                    />
                  </div>
                </div>

                {total > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ProgressBar percent={percent} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                      {total - purchased} left
                    </span>
                    {hideBoughtButton}
                  </div>
                )}

                {!isLoading && total > 0 && (
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{addForm}</div>
                    {scanButton}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {banners}
        {finished || (
          <>
            {states}
            {list}
          </>
        )}
      </div>

      {selectionMode && (
        <SelectionBulkBar count={selected.length} onTick={tickSelection} onRemove={removeSelection} />
      )}
    </>
  )
}

const desktopFrame: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
}

const desktopHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 20,
  padding: '26px 34px 18px',
  borderBottom: '1px solid var(--border)',
  flexWrap: 'wrap',
}

const eyebrow: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  color: 'var(--muted)',
}

const desktopTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 32,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  lineHeight: 1.15,
  margin: '4px 0 0',
}

const listColumn: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '22px 34px 26px',
  overflowY: 'auto',
}

const mobileFrame: CSSProperties = {
  position: 'absolute',
  inset: 0,
  overflowY: 'auto',
  padding: '46px 18px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const mobileTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 23,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  margin: 0,
}

const mobileProgress: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 14.5,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const headerProgress: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const mobileCancel: CSSProperties = {
  marginLeft: 'auto',
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 800,
}

// The scanner's one entry point, and it lives ON the list: a receipt scan returns
// confirmed lines to reconcile against exactly these rows, so putting it behind a
// completion screen would mean it was only reachable once the list was finished.
const scanStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  flexShrink: 0,
  borderRadius: 12,
  padding: '10px 13px',
  background: 'var(--accent-grad)',
  color: 'var(--olive-ink)',
  textDecoration: 'none',
}

const hideBoughtStyle: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--accent)',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 800,
  padding: 0,
}

const weekArrow: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--accent)',
  fontFamily: 'inherit',
  fontSize: 18,
  fontWeight: 800,
  padding: '0 6px',
}

const backToNow: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--accent)',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 800,
  padding: 0,
}

const banner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.45,
  marginBottom: 12,
  overflowWrap: 'anywhere',
}

const bannerButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface)',
}

// Same visually-hidden recipe as RecipeFormPage.shared.tsx's srOnlyInputStyle.
// No aria-label on the progress read: on a generic role it is ARIA-prohibited, and
// where it IS honoured it REPLACES the text — costing a screen-reader user the
// number, which is the whole content. This prefix adds the context instead, so it
// announces "Bought 1 of 3".
const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

const weekLabel: CSSProperties = {
  margin: '0 0 6px',
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: '0.02em',
}
