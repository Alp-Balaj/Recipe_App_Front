import { describe, expect, it } from 'vitest'
import type { MealPlanEntry, MealTypeName, DayName } from '@/api/mealPlans'
import { monthGridWeeks, parsePlanDate, formatPlanDate } from './planDates'
import {
  dayCalories,
  dayLoads,
  nextDinnerGap,
  repeatedFromYesterday,
  type PlannedWeek,
} from './planInsights'

const JULY = parsePlanDate('2026-07-01')!

let seq = 0
interface EntryOptions {
  title?: string
  minutes?: number
  calories?: number | null
}

function entry(
  day: DayName,
  meal: MealTypeName,
  recipeId: string,
  { title = recipeId, minutes = 30, calories = 500 }: EntryOptions = {},
): MealPlanEntry {
  seq += 1
  return {
    id: `e${seq}`,
    dayOfWeek: day,
    mealType: meal,
    recipe: {
      id: recipeId,
      title,
      imageUrl: null,
      totalTimeMinutes: minutes,
      caloriesPerServing: calories,
    },
  }
}

/** Build the byWeek map the grid hands these functions. */
function weeksFrom(monthStart: Date, plans: Record<string, MealPlanEntry[]>) {
  const grid = monthGridWeeks(monthStart)
  const byWeek = new Map<string, PlannedWeek>()
  for (const week of grid) {
    const key = formatPlanDate(week[0])
    byWeek.set(key, { weekStart: key, entries: plans[key] ?? [] })
  }
  return { grid, byWeek }
}

describe('repeatedFromYesterday', () => {
  it('marks the second day, not the first', () => {
    // July 2026's grid starts Mon 29 June; the week of 27 July is the last row.
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [
        entry('Monday', 'Dinner', 'r-ragu'),
        entry('Tuesday', 'Dinner', 'r-ragu'),
      ],
    })

    const marked = repeatedFromYesterday(grid, byWeek)

    expect(marked.has('2026-07-28|r-ragu')).toBe(true)
    expect(marked.has('2026-07-27|r-ragu')).toBe(false)
  })

  it('joins Sunday to Monday across two grid rows', () => {
    // The case a cell-border mark structurally cannot draw, and the most
    // common real repeat: cook it Sunday, finish it Monday.
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-20': [entry('Sunday', 'Dinner', 'r-ragu')],
      '2026-07-27': [entry('Monday', 'Lunch', 'r-ragu')],
    })

    const marked = repeatedFromYesterday(grid, byWeek)

    expect(marked.has('2026-07-27|r-ragu')).toBe(true)
  })

  it('leaves a two-day gap alone', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [
        entry('Monday', 'Dinner', 'r-ragu'),
        entry('Wednesday', 'Dinner', 'r-ragu'),
      ],
    })

    expect(repeatedFromYesterday(grid, byWeek).size).toBe(0)
  })

  it('matches on recipe id, so two dishes sharing a title are not a repeat', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [
        entry('Monday', 'Dinner', 'r-one', { title: 'Pasta' }),
        entry('Tuesday', 'Dinner', 'r-two', { title: 'Pasta' }),
      ],
    })

    expect(repeatedFromYesterday(grid, byWeek).size).toBe(0)
  })
})

describe('nextDinnerGap', () => {
  it('counts open dinners over the week ahead and points at the first', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      // Wed 1 July is planned; the rest of the horizon is not.
      '2026-06-29': [entry('Wednesday', 'Dinner', 'r-ragu')],
    })

    const gap = nextDinnerGap(grid, byWeek, parsePlanDate('2026-07-01')!)!

    expect(gap.horizonDays).toBe(7)
    expect(gap.open).toBe(6)
    expect(formatPlanDate(gap.first!)).toBe('2026-07-02')
  })

  it('ignores the other two meals', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-06-29': [
        entry('Wednesday', 'Breakfast', 'r-oats'),
        entry('Wednesday', 'Lunch', 'r-soup'),
      ],
    })

    const gap = nextDinnerGap(grid, byWeek, parsePlanDate('2026-07-01')!)!

    // A fully-planned breakfast and lunch leave the dinner still open.
    expect(gap.open).toBe(7)
    expect(formatPlanDate(gap.first!)).toBe('2026-07-01')
  })

  it('shrinks its window to what the grid can actually see', () => {
    // 2 August is the grid's last day, so a 7-day claim would be counting
    // three days whose entries were never fetched.
    const { grid, byWeek } = weeksFrom(JULY, {})

    const gap = nextDinnerGap(grid, byWeek, parsePlanDate('2026-07-30')!)!

    expect(gap.horizonDays).toBe(4)
    expect(gap.open).toBe(4)
  })

  it('reports nothing open once every dinner in the window is planned', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [
        entry('Saturday', 'Dinner', 'r-a'),
        entry('Sunday', 'Dinner', 'r-b'),
      ],
    })

    const gap = nextDinnerGap(grid, byWeek, parsePlanDate('2026-08-01')!)!

    expect(gap.open).toBe(0)
    expect(gap.first).toBeNull()
  })

  it('returns null when today is not on the displayed month at all', () => {
    const { grid, byWeek } = weeksFrom(JULY, {})

    expect(nextDinnerGap(grid, byWeek, parsePlanDate('2026-12-14')!)).toBeNull()
  })
})

describe('dayLoads', () => {
  it('sums a day across its meals', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [
        entry('Monday', 'Breakfast', 'r-oats', { minutes: 10, calories: 300 }),
        entry('Monday', 'Dinner', 'r-ragu', { minutes: 70, calories: 800 }),
      ],
    })

    const load = dayLoads(grid, byWeek).get('2026-07-27')!

    expect(load.minutes).toBe(80)
    expect(load.calories).toBe(1100)
    expect(load.planned).toBe(2)
    expect(load.counted).toBe(2)
  })

  it('counts time for a dish with no calorie figure, but not calories', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [
        entry('Monday', 'Lunch', 'r-soup', { minutes: 25, calories: null }),
        entry('Monday', 'Dinner', 'r-ragu', { minutes: 70, calories: 800 }),
      ],
    })

    const load = dayLoads(grid, byWeek).get('2026-07-27')!

    // totalTimeMinutes is required on every entry, so time is always whole.
    expect(load.minutes).toBe(95)
    expect(load.counted).toBe(1)
    expect(load.planned).toBe(2)
  })

  it('leaves an unplanned day out of the map entirely', () => {
    const { grid, byWeek } = weeksFrom(JULY, {
      '2026-07-27': [entry('Monday', 'Dinner', 'r-ragu')],
    })

    expect(dayLoads(grid, byWeek).has('2026-07-28')).toBe(false)
  })
})

describe('dayCalories', () => {
  it('refuses to total a day that is only partly counted', () => {
    // The whole point: a short bar reads as a light day, and a day whose lunch
    // merely lacks a figure is not a light day.
    expect(dayCalories({ minutes: 95, calories: 800, planned: 2, counted: 1 })).toBeNull()
  })

  it('totals a day where every planned meal has a figure', () => {
    expect(dayCalories({ minutes: 80, calories: 1100, planned: 2, counted: 2 })).toBe(1100)
  })

  it('has nothing to say about a day with no plan', () => {
    expect(dayCalories(undefined)).toBeNull()
    expect(dayCalories({ minutes: 0, calories: 0, planned: 0, counted: 0 })).toBeNull()
  })
})
