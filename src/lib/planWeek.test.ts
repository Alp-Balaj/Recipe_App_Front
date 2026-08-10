import { describe, expect, it } from 'vitest'
import type { MealPlanEntry } from '@/api/mealPlans'
import {
  formatWeekMinutes,
  nextUp,
  openDinners,
  repeatsWithinWeek,
  weekCoverage,
  weekDays,
  weekRangeLongOf,
} from './planWeek'

// Week of Monday 10 August 2026. Fixed, so nothing here depends on the clock.
const WEEK_START = new Date('2026-08-10T00:00:00.000Z')
const MONDAY = new Date('2026-08-10T00:00:00.000Z')
const WEDNESDAY = new Date('2026-08-12T00:00:00.000Z')

function entry(
  id: string,
  dayOfWeek: MealPlanEntry['dayOfWeek'],
  mealType: MealPlanEntry['mealType'],
  recipeId: string,
  title: string,
  minutes = 30,
): MealPlanEntry {
  return {
    id,
    dayOfWeek,
    mealType,
    recipe: { id: recipeId, title, imageUrl: null, totalTimeMinutes: minutes },
  }
}

const ENTRIES: MealPlanEntry[] = [
  entry('e-mon-b', 'Monday', 'Breakfast', 'r-oats', 'Overnight oats', 10),
  entry('e-mon-d', 'Monday', 'Dinner', 'r-bass', 'Sea bass', 45),
  entry('e-tue-b', 'Tuesday', 'Breakfast', 'r-oats', 'Overnight oats', 10),
  entry('e-tue-l', 'Tuesday', 'Lunch', 'r-halloumi', 'Halloumi salad', 20),
  entry('e-thu-d', 'Thursday', 'Dinner', 'r-stew', 'Beef stew', 160),
]

describe('weekDays', () => {
  it('lays the week out Monday first, with dates from the week start', () => {
    const days = weekDays(WEEK_START, ENTRIES)

    expect(days).toHaveLength(7)
    expect(days[0].key).toBe('2026-08-10')
    expect(days[6].key).toBe('2026-08-16')
  })

  it('orders a day’s entries by meal, not by the order the server sent them', () => {
    // Deliberately server-shuffled: dinner before breakfast.
    const shuffled = [ENTRIES[1], ENTRIES[0]]
    const monday = weekDays(WEEK_START, shuffled)[0]

    expect(monday.entries.map((e) => e.mealType)).toEqual(['Breakfast', 'Dinner'])
  })

  it('reports the slots that are actually open', () => {
    const days = weekDays(WEEK_START, ENTRIES)

    expect(days[0].openSlots).toEqual(['Lunch'])
    expect(days[1].openSlots).toEqual(['Dinner'])
    // Nothing planned on Wednesday at all.
    expect(days[2].openSlots).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  })

  it('sums the day’s cook time', () => {
    expect(weekDays(WEEK_START, ENTRIES)[0].minutes).toBe(55)
  })
})

describe('weekCoverage', () => {
  it('counts planned slots against the week’s 21', () => {
    const coverage = weekCoverage(weekDays(WEEK_START, ENTRIES))

    expect(coverage.planned).toBe(5)
    expect(coverage.total).toBe(21)
    expect(coverage.minutes).toBe(245)
  })

  it('counts a dish planned twice as two dishes', () => {
    // Overnight oats is one recipe in two slots — the header counts SLOTS,
    // because "9 of 21 planned" is about the grid, not about variety.
    const coverage = weekCoverage(weekDays(WEEK_START, ENTRIES))
    expect(coverage.dishes).toBe(5)
  })
})

describe('nextUp', () => {
  it('picks the next meal from today onward, in meal order', () => {
    const days = weekDays(WEEK_START, ENTRIES)
    const next = nextUp(days, MONDAY, new Set())

    // Monday breakfast, not Monday dinner and not the first entry in the array.
    expect(next?.entry.id).toBe('e-mon-b')
    expect(next?.whenLabel).toBe('TONIGHT')
  })

  it('skips meals already cooked', () => {
    const days = weekDays(WEEK_START, ENTRIES)
    const next = nextUp(days, MONDAY, new Set(['e-mon-b']))

    expect(next?.entry.id).toBe('e-mon-d')
  })

  it('ignores days before today', () => {
    const days = weekDays(WEEK_START, ENTRIES)
    const next = nextUp(days, WEDNESDAY, new Set())

    // Monday and Tuesday are behind us; Wednesday is empty; Thursday is next —
    // and Thursday the 13th is tomorrow, so it is labelled as such rather than
    // by weekday.
    expect(next?.entry.id).toBe('e-thu-d')
    expect(next?.whenLabel).toBe('TOMORROW')
  })

  it('names a weekday further out', () => {
    const days = weekDays(WEEK_START, [entry('e-sat', 'Saturday', 'Dinner', 'r-manti', 'Mantı')])
    const next = nextUp(days, MONDAY, new Set())

    expect(next?.whenLabel).toBe('SATURDAY')
  })

  it('labels tomorrow as TOMORROW', () => {
    const days = weekDays(WEEK_START, ENTRIES)
    const next = nextUp(days, MONDAY, new Set(['e-mon-b', 'e-mon-d']))

    expect(next?.entry.id).toBe('e-tue-b')
    expect(next?.whenLabel).toBe('TOMORROW')
  })

  it('is null when everything ahead is cooked', () => {
    const days = weekDays(WEEK_START, ENTRIES)
    const allIds = new Set(ENTRIES.map((e) => e.id))

    expect(nextUp(days, MONDAY, allIds)).toBeNull()
  })
})

describe('repeatsWithinWeek', () => {
  it('marks the SECOND day a dish appears on', () => {
    const repeats = repeatsWithinWeek(weekDays(WEEK_START, ENTRIES))

    // Oats on Monday and Tuesday — Tuesday carries the mark, Monday does not.
    expect(repeats.has('2026-08-11|r-oats')).toBe(true)
    expect(repeats.has('2026-08-10|r-oats')).toBe(false)
  })

  it('matches on recipe id, never title', () => {
    const twins = [
      entry('a', 'Monday', 'Dinner', 'r-one', 'Pasta'),
      entry('b', 'Tuesday', 'Dinner', 'r-two', 'Pasta'),
    ]
    const repeats = repeatsWithinWeek(weekDays(WEEK_START, twins))

    // Two different recipes that happen to share a name are not the same dinner
    // twice.
    expect(repeats.size).toBe(0)
  })

  it('does not mark a gap — Monday then Wednesday is not a repeat', () => {
    const spaced = [
      entry('a', 'Monday', 'Dinner', 'r-one', 'Pasta'),
      entry('b', 'Wednesday', 'Dinner', 'r-one', 'Pasta'),
    ]

    expect(repeatsWithinWeek(weekDays(WEEK_START, spaced)).size).toBe(0)
  })
})

describe('openDinners', () => {
  it('counts only dinners, and only from today onward', () => {
    const days = weekDays(WEEK_START, ENTRIES)
    const gaps = openDinners(days, WEDNESDAY)

    // Mon has a dinner (and is behind us anyway), Thu has one. Wed, Fri, Sat,
    // Sun are open. Tuesday's open dinner is in the past and is not a gap.
    expect(gaps.days.map((d) => d.key)).toEqual([
      '2026-08-12',
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
    ])
  })

  it('reads the list as a sentence', () => {
    const gaps = openDinners(weekDays(WEEK_START, ENTRIES), new Date('2026-08-14T00:00:00.000Z'))
    expect(gaps.label).toBe('Fri, Sat and Sun')
  })

  it('is empty when every dinner ahead is planned', () => {
    const days = weekDays(WEEK_START, [
      entry('a', 'Saturday', 'Dinner', 'r-a', 'A'),
      entry('b', 'Sunday', 'Dinner', 'r-b', 'B'),
    ])
    const gaps = openDinners(days, new Date('2026-08-15T00:00:00.000Z'))

    expect(gaps.days).toHaveLength(0)
    expect(gaps.label).toBe('')
  })
})

describe('formatWeekMinutes', () => {
  it('formats hours and minutes', () => {
    expect(formatWeekMinutes(260)).toBe('4h 20m')
    expect(formatWeekMinutes(120)).toBe('2h')
    expect(formatWeekMinutes(45)).toBe('45m')
  })

  it('says nothing when nothing is planned', () => {
    expect(formatWeekMinutes(0)).toBe('')
  })
})

describe('weekRangeLongOf', () => {
  it('names the month once when the week stays inside it', () => {
    expect(weekRangeLongOf(WEEK_START)).toBe('10 – 16 August')
  })

  it('names both months across a boundary', () => {
    expect(weekRangeLongOf(new Date('2026-07-27T00:00:00.000Z'))).toBe('27 July – 2 August')
  })
})
