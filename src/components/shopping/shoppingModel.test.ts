import { describe, expect, it } from 'vitest'
import type { ShoppingGroup, ShoppingWeek } from '@/api/shopping'
import {
  aisleSummaries,
  describeSelection,
  dishSummaries,
  itemsOf,
  provenanceOf,
  sectionsOf,
  weekRange,
} from './shoppingModel'

// The week these fixtures live in: Monday 2026-08-03 → Sunday 2026-08-09.
const MONDAY = '2026-08-03T00:00:00Z'
const day = (offset: number) =>
  new Date(Date.UTC(2026, 7, 3 + offset)).toISOString().replace('.000Z', 'Z')

const group = (over: Partial<ShoppingGroup> & { key: string; displayName: string }): ShoppingGroup => ({
  parts: [],
  dishes: [],
  isPurchased: false,
  origin: 'Derived',
  manualItemId: null,
  totals: [],
  aisle: 'Pantry',
  ...over,
})

const week = (groups: ShoppingGroup[]): ShoppingWeek => ({
  weekStartDate: MONDAY,
  groups,
  purchasedCount: groups.filter((one) => one.isPurchased).length,
  totalCount: groups.length,
})

const onions = group({
  key: 'onions',
  displayName: 'Onions',
  aisle: 'Produce',
  parts: [
    { quantity: '2', dishTitle: 'Shakshuka', date: day(0), meal: 'Dinner' },
    { quantity: '2', dishTitle: 'Chickpea stew', date: day(4), meal: 'Dinner' },
  ],
  dishes: ['Shakshuka', 'Chickpea stew'],
  totals: [{ quantity: 4, unit: 'Piece', display: '4 pcs' }],
})

const eggs = group({
  key: 'eggs',
  displayName: 'Eggs',
  aisle: 'Dairy & eggs',
  parts: [{ quantity: '6', dishTitle: 'Shakshuka', date: day(0), meal: 'Dinner' }],
  dishes: ['Shakshuka'],
  isPurchased: true,
  totals: [{ quantity: 6, unit: 'Piece', display: '6 pcs' }],
})

const binBags = group({
  key: 'manual:1',
  displayName: 'Bin bags',
  aisle: 'Other',
  origin: 'Manual',
  manualItemId: '1',
  parts: [{ quantity: '1 roll', dishTitle: 'Added by you', date: null, meal: null }],
})

describe('itemsOf', () => {
  it('files a shared ingredient under the first dish of the week and names the rest', () => {
    const [item] = itemsOf(week([onions]))

    expect(item.ownerDish).toBe('Shakshuka')
    expect(item.ownerDate).toBe(day(0))
    expect(item.alsoDishes).toEqual(['Chickpea stew'])
    // The number you act on in an aisle, not the per-dish breakdown.
    expect(item.amount).toBe('4 pcs')
  })

  it('gives a manual row no dish at all rather than the label the wire carries', () => {
    // "Added by you" is a label the projection puts in DishTitle so the old page
    // had something to print. Rendering it as provenance would read as a dish.
    const [item] = itemsOf(week([binBags]))

    expect(item.ownerDish).toBeNull()
    expect(provenanceOf(item)).toBeNull()
    expect(item.amount).toBe('1 roll')
  })

  it('keeps a row usable when the aisle is missing from the payload', () => {
    const [item] = itemsOf(week([group({ key: 'x', displayName: 'Mystery', aisle: '' })]))
    expect(item.aisle).toBe('Other')
  })

  it('is unique per week, so scope All cannot select one row and act on two', () => {
    const items = [...itemsOf(week([onions])), ...itemsOf({ ...week([onions]), weekStartDate: '2026-07-27T00:00:00Z' })]
    expect(new Set(items.map((item) => item.id)).size).toBe(2)
    expect(items[0].key).toBe(items[1].key) // same group key — the id is what differs
  })
})

describe('provenanceOf', () => {
  it('reads "Dish · Day", naming one sharer and counting more', () => {
    const [item] = itemsOf(week([onions]))
    expect(provenanceOf(item)).toBe('Shakshuka · Mon, + Chickpea stew')

    const crowded = itemsOf(
      week([
        group({
          ...onions,
          parts: [
            ...onions.parts,
            { quantity: '1', dishTitle: 'Focaccia', date: day(5), meal: 'Dinner' },
            { quantity: '1', dishTitle: 'Soup', date: day(6), meal: 'Lunch' },
          ],
        }),
      ]),
    )[0]
    // Three names would wrap a phone row onto a third line.
    expect(provenanceOf(crowded)).toBe('Shakshuka · Mon, + 3 more')
  })

  it('never names the owning dish twice when it is planned twice', () => {
    const twice = itemsOf(
      week([
        group({
          key: 'butter',
          displayName: 'Butter',
          parts: [
            { quantity: '1 tbsp', dishTitle: 'Toast', date: day(0), meal: 'Breakfast' },
            { quantity: '2 tbsp', dishTitle: 'Toast', date: day(2), meal: 'Breakfast' },
          ],
        }),
      ]),
    )[0]

    expect(twice.alsoDishes).toEqual([])
    expect(provenanceOf(twice)).toBe('Toast · Mon')
  })
})

describe('sectionsOf', () => {
  const items = itemsOf(week([onions, eggs, binBags]))

  it('keeps the server walk order by aisle and counts what is left', () => {
    const sections = sectionsOf(items, 'aisle')

    expect(sections.map((section) => section.title)).toEqual(['Produce', 'Dairy & eggs', 'Other'])
    expect(sections[1]).toMatchObject({ total: 1, remaining: 0 })
    expect(sections[0]).toMatchObject({ total: 1, remaining: 1 })
  })

  it('re-groups by dish in the order they are cooked, without duplicating a shared row', () => {
    const sections = sectionsOf(items, 'dish')

    // Onions belong to Shakshuka only, even though the stew wants them too — the
    // whole point of buy-once. The manual row has no dish and sorts last.
    expect(sections.map((section) => section.title)).toEqual(['Shakshuka', 'Added by you'])
    expect(sections[0].items.map((item) => item.name)).toEqual(['Onions', 'Eggs'])
    expect(sections[0].eyebrow).toBe('Mon')
    expect(sections.flatMap((section) => section.items)).toHaveLength(3)

    // Under a dish heading the owner is not repeated on every row — only the
    // dishes the heading cannot account for survive.
    const [onionRow, eggRow] = sections[0].items
    expect(provenanceOf(onionRow, 'dish')).toBe('+ Chickpea stew')
    expect(provenanceOf(eggRow, 'dish')).toBeNull()
  })
})

describe('rail summaries', () => {
  const items = itemsOf(week([onions, eggs, binBags]))

  it('counts each aisle by what it still owes', () => {
    expect(aisleSummaries(items)).toEqual([
      { aisle: 'Produce', remaining: 1, total: 1 },
      { aisle: 'Dairy & eggs', remaining: 0, total: 1 },
      { aisle: 'Other', remaining: 1, total: 1 },
    ])
  })

  it('counts a dish by everything it needs, including rows filed under another dish', () => {
    const dishes = dishSummaries(items)

    // Shakshuka owns both its rows, one of which is bought.
    expect(dishes[0]).toMatchObject({ title: 'Shakshuka', bought: 1, total: 2 })
    // The stew owns nothing, but it still needs the onions in the house — so it
    // is listed, and the per-dish counts deliberately do not sum to the list.
    expect(dishes[1]).toMatchObject({ title: 'Chickpea stew', bought: 0, total: 1 })
  })
})

describe('describeSelection', () => {
  const items = itemsOf(week([onions, eggs, binBags]))
  const sections = sectionsOf(items, 'aisle')

  it('names a whole aisle when the aisle is entirely taken', () => {
    const selected = items.filter((item) => item.aisle === 'Produce')
    const ids = new Set(selected.map((item) => item.id))
    expect(describeSelection(selected, sections, ids)).toBe('Whole aisle — Produce')
  })

  it('falls back to a count once the selection spans aisles', () => {
    const ids = new Set(items.map((item) => item.id))
    expect(describeSelection(items, sections, ids)).toBe('3 aisles')
  })
})

describe('weekRange', () => {
  it('states the month once within a month, and twice across one', () => {
    expect(weekRange(MONDAY)).toBe('Mon 3 – Sun 9 Aug')
    expect(weekRange('2026-07-27T00:00:00Z')).toBe('Mon 27 Jul – Sun 2 Aug')
  })
})
