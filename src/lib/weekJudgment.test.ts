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
})
