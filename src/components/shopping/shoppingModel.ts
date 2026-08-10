// ─────────────────────────────────────────────────────────────────────────
// The shopping list's view model (shop redesign, direction 1c).
//
// Everything the redesigned page renders is DERIVED here, in plain functions over
// the wire projection, for one reason: the page has four grouping/scope/filter
// controls and three counters that must never disagree with each other. Deriving
// them in the components would mean the aisle header's "2 OF 6 LEFT", the rail's
// per-aisle count and the progress bar each doing their own arithmetic over their
// own slice — which is exactly how a list ends up saying "13 left" above six rows.
//
// One row is one ITEM: a flattened ShoppingGroup that has already answered the two
// questions the design asks of every row — which aisle shelves it, and which dish
// owns it. Neither is a client-side guess; both come from the projection (see
// ShoppingAisles and ShoppingListPartResponse.Date server-side). What is decided
// here is only how they READ.
//
// Ordering is the server's, deliberately, and no function in this file sorts items
// by anything else. Groups arrive in aisle walk order, and re-sorting them
// alphabetically here would put Drinks before Produce.
// ─────────────────────────────────────────────────────────────────────────

import type { ShoppingGroup, ShoppingWeek } from '@/api/shopping'

export type GroupBy = 'aisle' | 'dish'

/** One rendered row. `group` rides along because the writes need the wire shape. */
export interface ShoppingItem {
  /**
   * Unique ACROSS weeks, which `key` is not: under scope 'All' the same
   * ingredient in two weeks is two rows carrying the same group key, and a
   * selection keyed on that alone would take both.
   */
  id: string
  key: string
  name: string
  /** What to buy, right-aligned in the row — the summed total, or the free text. */
  amount: string
  aisle: string
  /** The dish this is filed under: the week's FIRST that needs it. Null for manual rows. */
  ownerDish: string | null
  /** ISO date of that dish, for ordering the dish view and the rail. */
  ownerDate: string | null
  /** Every other dish that needs it — named on the row, never given a second row. */
  alsoDishes: string[]
  bought: boolean
  /**
   * Every planned meal that needs this has been cooked. Server-derived, never stored.
   *
   * Deliberately NOT merged into `bought`: that one is the tick the checkbox writes back,
   * and a row can be both. What they share is only how they READ — see `isDone`.
   */
  resolved: boolean
  /** The week the row belongs to. Under scope 'All' this is NOT the scoped week. */
  weekStartDate: string
  group: ShoppingGroup
}

/** A rendered block of rows under one heading — an aisle, or a dish. */
export interface ShoppingSection {
  id: string
  title: string
  /** Only the dish view has one: the day the dish is planned for. */
  eyebrow?: string
  items: ShoppingItem[]
  /** Total rows under this heading, ticked included — the "OF 6" in "2 OF 6 LEFT". */
  total: number
  /** Still to buy — the "2". */
  remaining: number
}

/** A dish's line in the desktop rail: "Mon · Shakshuka · 1/5". */
export interface DishSummary {
  title: string
  date: string | null
  bought: number
  total: number
}

/** An aisle's line in the rail's jump list, counting what is still owed. */
export interface AisleSummary {
  aisle: string
  remaining: number
  total: number
}

/**
 * Flatten a week's groups into rows.
 *
 * The owner is `parts[0]`, and that is a contract with the server rather than a
 * convenience: the projection sorts parts by (date, meal) precisely so the first
 * one is the week's earliest dish. Re-deriving it here by comparing dates would
 * duplicate the rule and quietly disagree with it the first time two dishes share
 * a day.
 */
export function itemsOf(week: ShoppingWeek): ShoppingItem[] {
  return week.groups.map((group) => {
    const [owner, ...rest] = group.parts
    // A manual row's single part is the literal string "Added by you" — a label,
    // not a dish, and the row shows no provenance line at all.
    const isManual = group.origin === 'Manual'

    return {
      id: `${week.weekStartDate}::${group.key}`,
      key: group.key,
      name: group.displayName,
      amount: amountOf(group),
      // Defaulted, though the server always sends one: an aisle-LED list whose
      // headings are `undefined` is not a degraded list, it is an unreadable one,
      // and a cached response from before the field existed would do exactly that.
      aisle: group.aisle || 'Other',
      ownerDish: isManual ? null : (owner?.dishTitle ?? null),
      ownerDate: isManual ? null : (owner?.date ?? null),
      // Distinct, and never including the owner: "Shakshuka, + Shakshuka" is what
      // a dish planned twice in one week would otherwise read as.
      alsoDishes: isManual
        ? []
        : [...new Set(rest.map((part) => part.dishTitle))].filter((dish) => dish !== owner?.dishTitle),
      bought: group.isPurchased,
      // Defaulted for the same reason `aisle` is: a cached response from before the field
      // existed must read as "not resolved", not as `undefined` leaking into a counter.
      resolved: group.resolvedByCooking ?? false,
      weekStartDate: week.weekStartDate,
      group,
    }
  })
}

/**
 * What the row states on the right. The TOTAL when there is one — that is the
 * number you act on in an aisle ("1.2 kg") — falling back to the parts as written
 * when there is nothing to sum (a pinch, or a manual row's free text).
 */
function amountOf(group: ShoppingGroup): string {
  if (group.totals.length > 0) return group.totals.map((total) => total.display).join(' + ')
  return [...new Set(group.parts.map((part) => part.quantity))].join(' + ')
}

/**
 * The row's second line: "Shakshuka · Mon", plus the dishes that share it.
 *
 * One extra dish is NAMED, because the name is the useful thing ("oh, the stew
 * wants onions too"). Beyond one it becomes a count — three names on a phone row
 * wrap to a third line and stop being scannable, which is the whole reason the
 * design put provenance in one small italic line.
 */
export function provenanceOf(item: ShoppingItem, groupBy: GroupBy = 'aisle'): string | null {
  if (!item.ownerDish) return null

  const sharers =
    item.alsoDishes.length === 0
      ? null
      : item.alsoDishes.length === 1
        ? `+ ${item.alsoDishes[0]}`
        : `+ ${item.alsoDishes.length} more`

  // Under a DISH heading the owner is already named a line above, so repeating
  // "Shakshuka · Mon" under "Mon Shakshuka" five times in a row is noise. What
  // survives is the part the heading cannot say: who else wants it.
  if (groupBy === 'dish') return sharers

  const day = item.ownerDate ? formatDay(item.ownerDate) : null
  const head = day ? `${item.ownerDish} · ${day}` : item.ownerDish
  return sharers ? `${head}, ${sharers}` : head
}

/** "Mon". UTC because plan dates are UTC-midnight — local would slip a day west of Greenwich. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

/**
 * "Mon 3 – Sun 9 Aug" — the desktop header's week range.
 *
 * The month is stated once when both ends share it, which is the design's exact
 * string. Across a month boundary both keep theirs ("Mon 29 Jul – Sun 4 Aug"),
 * because that is the case where dropping it would be ambiguous.
 */
export function weekRange(weekStartIso: string): string {
  const start = new Date(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)

  // Composed part by part rather than handed to Intl as one pattern. Asking for
  // {weekday, day, month} together lets the locale ORDER them, and several put the
  // number first ("3 Mon – Sun, Aug 9") — which is not a range any more, it is
  // rubble. The NAMES stay localised; only their arrangement is ours.
  const weekday = (date: Date) => date.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
  const month = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })

  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const from = `${weekday(start)} ${start.getUTCDate()}${sameMonth ? '' : ` ${month(start)}`}`
  return `${from} – ${weekday(end)} ${end.getUTCDate()} ${month(end)}`
}

/**
 * Is this row finished with, for counting and sweeping purposes — bought, or resolved
 * because you already cooked everything that wanted it.
 *
 * One function because this file exists to stop the page's several counters disagreeing,
 * and "done" is now two facts rather than one. The two stay separate on the ITEM; they
 * only ever merge here.
 */
export function isDone(item: ShoppingItem): boolean {
  return item.bought || item.resolved
}

/**
 * Group rows under headings.
 *
 * By AISLE, sections appear in the order the server shelved them — walk order, so
 * produce leads and the uncatalogued remainder trails.
 *
 * By DISH, they appear in the order you will cook them, and the heading carries
 * the day. Rows keep their buy-once owner, so an ingredient shared by Monday and
 * Friday appears under Monday only: "by dish" re-groups the same list, it does not
 * expand it into a per-dish shopping list (which would tell you to buy onions
 * twice — the exact thing this projection exists to stop).
 */
export function sectionsOf(items: ShoppingItem[], groupBy: GroupBy): ShoppingSection[] {
  const sections = new Map<string, ShoppingSection>()

  for (const item of items) {
    const key = groupBy === 'aisle' ? item.aisle : (item.ownerDish ?? ADDED_BY_YOU)
    let section = sections.get(key)
    if (!section) {
      section = {
        id: key,
        title: key,
        eyebrow:
          groupBy === 'dish' && item.ownerDate ? formatDay(item.ownerDate) : undefined,
        items: [],
        total: 0,
        remaining: 0,
      }
      sections.set(key, section)
    }
    section.items.push(item)
    section.total += 1
    if (!isDone(item)) section.remaining += 1
  }

  const ordered = [...sections.values()]
  if (groupBy === 'aisle') return ordered // already in walk order

  // Dish order is the week's order. Rows carry their dish's date, so the first row
  // in a section answers for it; a dishless section (manual rows) sorts last.
  return ordered.sort((a, b) => {
    const dateA = a.items[0]?.ownerDate
    const dateB = b.items[0]?.ownerDate
    if (!dateA && !dateB) return 0
    if (!dateA) return 1
    if (!dateB) return -1
    return dateA.localeCompare(dateB) || a.title.localeCompare(b.title)
  })
}

/** The heading manual rows collect under in the dish view — they serve no dish. */
export const ADDED_BY_YOU = 'Added by you'

/** The rail's jump list: every aisle in walk order with what it still owes. */
export function aisleSummaries(items: ShoppingItem[]): AisleSummary[] {
  const byAisle = new Map<string, AisleSummary>()
  for (const item of items) {
    const summary = byAisle.get(item.aisle) ?? { aisle: item.aisle, remaining: 0, total: 0 }
    summary.total += 1
    if (!isDone(item)) summary.remaining += 1
    byAisle.set(item.aisle, summary)
  }
  return [...byAisle.values()]
}

/**
 * The rail's "THIS WEEK'S DISHES" card — every dish the week plans, with how much
 * of its shopping is done.
 *
 * Counted over EVERY dish a row serves, not just the owning one, which is the only
 * honest answer to "how ready is Friday's stew": the onions it shares with Monday
 * are filed under Monday, but Friday still needs them in the house. So the per-dish
 * counts deliberately do not sum to the list's total — the same shared row is
 * counted for both dishes.
 */
export function dishSummaries(items: ShoppingItem[]): DishSummary[] {
  const byDish = new Map<string, DishSummary>()

  for (const item of items) {
    if (!item.ownerDish) continue
    for (const dish of [item.ownerDish, ...item.alsoDishes]) {
      const summary = byDish.get(dish) ?? {
        title: dish,
        // Only the owning dish's date is known — a shared dish's own date lives on
        // a part this row is not filed under. It gets one when it owns something.
        date: dish === item.ownerDish ? item.ownerDate : null,
        bought: 0,
        total: 0,
      }
      if (summary.date === null && dish === item.ownerDish) summary.date = item.ownerDate
      summary.total += 1
      if (isDone(item)) summary.bought += 1
      byDish.set(dish, summary)
    }
  }

  return [...byDish.values()].sort((a, b) => {
    if (!a.date && !b.date) return a.title.localeCompare(b.title)
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date) || a.title.localeCompare(b.title)
  })
}

/**
 * What the selection IS, in words — the dark bar's second line and the mobile
 * note. "Whole aisle" is the case worth naming: it is reachable in one tap from
 * the aisle header checkbox, and confirming it is what stops a bulk tick feeling
 * like a gamble.
 */
export function describeSelection(
  selected: ShoppingItem[],
  sections: ShoppingSection[],
  /** Membership by id, not by object identity — items are rebuilt on every render. */
  selectedIds: ReadonlySet<string>,
): string {
  if (selected.length === 0) return ''

  const aisles = new Set(selected.map((item) => item.aisle))
  if (aisles.size === 1) {
    const [aisle] = [...aisles]
    const section = sections.find((candidate) => candidate.id === aisle)
    if (section && section.items.every((item) => selectedIds.has(item.id))) {
      return `Whole aisle — ${aisle}`
    }
    return `All in ${aisle}`
  }
  return `${aisles.size} aisles`
}
