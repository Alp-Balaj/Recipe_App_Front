import { describe, expect, it } from 'vitest'
import { dinnerRepeats, weekJudgment } from './weekJudgment'
import type { DayName, MealPlanEntry, MealTypeName } from '@/api/mealPlans'

const entry = (
  id: string, day: DayName, meal: MealTypeName, title: string,
  minutes: number, kcal: number | null,
): MealPlanEntry => ({
  id, dayOfWeek: day, mealType: meal,
  recipe: { id: title, title, imageUrl: null, totalTimeMinutes: minutes, caloriesPerServing: kcal },
})

const MONDAY = new Date('2026-07-27T00:00:00Z')

describe('weekJudgment', () => {
  it('returns seven days even when nothing is planned', () => {
    const result = weekJudgment(MONDAY, [])
    expect(result.days).toHaveLength(7)
    expect(result.days.every((d) => d.minutes === 0 && d.plannedCount === 0)).toBe(true)
  })

  it('says nothing rather than zero for an empty week', () => {
    const result = weekJudgment(MONDAY, [])
    expect(result.averageMinutes).toBe(0)
    expect(result.heaviestDay).toBeNull()
  })

  it('averages over PLANNED days only, not all seven', () => {
    // 100 minutes on one day is a 100-minute average, not 100/7.
    const result = weekJudgment(MONDAY, [entry('1', 'Monday', 'Dinner', 'Roast', 100, 800)])
    expect(result.averageMinutes).toBe(100)
    expect(result.heaviestMinutes).toBe(100)
    expect(result.heaviestDay?.dayName).toBe('Monday')
  })

  it('sums a day across its meals', () => {
    const result = weekJudgment(MONDAY, [
      entry('1', 'Thursday', 'Breakfast', 'Oats', 10, 300),
      entry('2', 'Thursday', 'Dinner', 'Tagine', 130, 900),
    ])
    const thursday = result.days.find((d) => d.dayName === 'Thursday')!
    expect(thursday.minutes).toBe(140)
    expect(thursday.calories).toBe(1200)
    expect(thursday.isCalorieCounted).toBe(true)
  })

  it('reports a partly-counted day as not counted, never as a smaller number', () => {
    const result = weekJudgment(MONDAY, [
      entry('1', 'Friday', 'Breakfast', 'Oats', 10, 300),
      entry('2', 'Friday', 'Dinner', 'Mystery', 30, null),
    ])
    const friday = result.days.find((d) => d.dayName === 'Friday')!
    expect(friday.calories).toBeNull()
    expect(friday.isCalorieCounted).toBe(false)
    expect(friday.minutes).toBe(40)      // effort is still complete
  })

  it('does not round the average — pins the raw float', () => {
    // (100 + 51) / 2 = 75.5, which does not divide evenly. averageMinutes is
    // a deliberately unrounded float; a display surface rounds it, not this.
    const result = weekJudgment(MONDAY, [
      entry('1', 'Monday', 'Dinner', 'Soup', 100, 600),
      entry('2', 'Tuesday', 'Dinner', 'Toast', 51, 300),
    ])
    expect(result.averageMinutes).toBe(75.5)
  })

  it('keeps the earlier day when two days tie for heaviest', () => {
    const result = weekJudgment(MONDAY, [
      entry('1', 'Monday', 'Dinner', 'Soup', 100, 600),
      entry('2', 'Wednesday', 'Dinner', 'Stew', 100, 600),
    ])
    expect(result.heaviestMinutes).toBe(100)
    expect(result.heaviestDay?.dayName).toBe('Monday')
  })
})

describe('dinnerRepeats', () => {
  it('counts a dinner planned more than once', () => {
    const repeats = dinnerRepeats([
      entry('1', 'Monday', 'Dinner', 'Pasta', 30, 600),
      entry('2', 'Wednesday', 'Dinner', 'Pasta', 30, 600),
      entry('3', 'Friday', 'Dinner', 'Pasta', 30, 600),
    ])
    expect(repeats).toEqual([{ title: 'Pasta', count: 3 }])
  })

  it('ignores breakfast and lunch routines entirely', () => {
    // Eating the same oats every weekday is deliberate, not a fault to flag.
    const repeats = dinnerRepeats([
      entry('1', 'Monday', 'Breakfast', 'Oats', 5, 300),
      entry('2', 'Tuesday', 'Breakfast', 'Oats', 5, 300),
      entry('3', 'Monday', 'Lunch', 'Soup', 5, 300),
      entry('4', 'Tuesday', 'Lunch', 'Soup', 5, 300),
    ])
    expect(repeats).toEqual([])
  })

  it('omits dinners planned once', () => {
    expect(dinnerRepeats([entry('1', 'Monday', 'Dinner', 'Pasta', 30, 600)])).toEqual([])
  })

  it('sorts by count descending, then title ascending on a tie', () => {
    const repeats = dinnerRepeats([
      entry('1', 'Monday', 'Dinner', 'Zucchini Bake', 40, 500),
      entry('2', 'Tuesday', 'Dinner', 'Zucchini Bake', 40, 500),
      entry('3', 'Wednesday', 'Dinner', 'Zucchini Bake', 40, 500),
      entry('4', 'Thursday', 'Dinner', 'Banana Bowl', 40, 500),
      entry('5', 'Friday', 'Dinner', 'Banana Bowl', 40, 500),
      entry('6', 'Saturday', 'Dinner', 'Apple Crumble', 40, 500),
      entry('7', 'Sunday', 'Dinner', 'Apple Crumble', 40, 500),
    ])
    // Zucchini (3) outranks the alphabetically-earlier Apple/Banana (2 each)
    // on count; Apple and Banana tie on count, so title breaks the tie.
    expect(repeats).toEqual([
      { title: 'Zucchini Bake', count: 3 },
      { title: 'Apple Crumble', count: 2 },
      { title: 'Banana Bowl', count: 2 },
    ])
  })

  // recipe.id, not title, is the repeat key — mirrors planInsights'
  // repeatedFromYesterday, so the month and week surfaces agree about what a
  // repeat is. Built by hand rather than via the `entry` helper, because the
  // helper sets recipe.id === title, which would hide this distinction.
  it('does not treat two different recipes with the same title as a repeat', () => {
    const repeats = dinnerRepeats([
      {
        id: '1', dayOfWeek: 'Monday', mealType: 'Dinner',
        recipe: { id: 'recipe-a', title: 'Pasta', imageUrl: null, totalTimeMinutes: 30, caloriesPerServing: 600 },
      },
      {
        id: '2', dayOfWeek: 'Wednesday', mealType: 'Dinner',
        recipe: { id: 'recipe-b', title: 'Pasta', imageUrl: null, totalTimeMinutes: 30, caloriesPerServing: 600 },
      },
    ])
    expect(repeats).toEqual([])
  })

  it('counts by recipe id even when the title is edited between plannings', () => {
    const repeats = dinnerRepeats([
      {
        id: '1', dayOfWeek: 'Monday', mealType: 'Dinner',
        recipe: { id: 'recipe-a', title: 'Spaghetti', imageUrl: null, totalTimeMinutes: 30, caloriesPerServing: 600 },
      },
      {
        id: '2', dayOfWeek: 'Wednesday', mealType: 'Dinner',
        recipe: { id: 'recipe-a', title: 'Pasta', imageUrl: null, totalTimeMinutes: 30, caloriesPerServing: 600 },
      },
    ])
    expect(repeats).toEqual([{ title: 'Pasta', count: 2 }])
  })
})
