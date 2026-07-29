import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import WeekGrid from './WeekGrid'
import type { MealPlanEntry } from '@/api/mealPlans'

const entry: MealPlanEntry = {
  id: 'e1',
  dayOfWeek: 'Wednesday',
  mealType: 'Dinner',
  recipe: { id: 'r1', title: 'Lentil Soup', imageUrl: null, totalTimeMinutes: 30 },
}

describe('WeekGrid', () => {
  it('renders all seven days', () => {
    render(<WeekGrid entries={[]} />)
    for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(screen.getByText(new RegExp(day, 'i'))).toBeInTheDocument()
    }
  })

  it('renders 21 slots — seven days by three meals', () => {
    render(<WeekGrid entries={[]} />)
    expect(screen.getAllByTestId('slot-cell')).toHaveLength(21)
  })

  it('places an entry in its own day and meal slot', () => {
    render(<WeekGrid entries={[entry]} />)
    const slot = screen.getByTestId('slot-Wednesday-Dinner')
    expect(slot).toHaveTextContent('Lentil Soup')
  })

  it('leaves the other slots empty', () => {
    render(<WeekGrid entries={[entry]} />)
    expect(screen.getByTestId('slot-Monday-Breakfast')).not.toHaveTextContent('Lentil Soup')
  })
})
