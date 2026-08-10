import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import EmptyWeekExplainer from './EmptyWeekExplainer'

const base = {
  weekLabel: 'Aug 10–16',
  isCurrentWeek: true,
  otherWeeks: [],
  onRestore: () => {},
  onJumpToWeek: () => {},
}

it('lists hidden items with a restore action', async () => {
  const onRestore = vi.fn()
  render(
    <EmptyWeekExplainer
      {...base}
      onRestore={onRestore}
      diagnostics={{
        hiddenItems: [{ key: 'onion', displayName: 'Onion', isPurchased: false }],
        mealsWithoutIngredients: [],
        unavailableRecipeCount: 0,
      }}
    />,
  )
  expect(screen.getByText(/hidden for this week/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /restore onion/i }))
  expect(onRestore).toHaveBeenCalledWith('onion', false)
})

// Spec §3.1: Restore preserves the tick. The component's whole job here is to hand back
// the item's OWN isPurchased rather than a constant, so the two cases have to be
// distinguishable — a `false` literal in the onClick would pass the test above and fail
// this one.
it('hands back a hidden item’s own purchase tick when it was already bought', async () => {
  const onRestore = vi.fn()
  render(
    <EmptyWeekExplainer
      {...base}
      onRestore={onRestore}
      diagnostics={{
        hiddenItems: [{ key: 'onion', displayName: 'Onion', isPurchased: true }],
        mealsWithoutIngredients: [],
        unavailableRecipeCount: 0,
      }}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: /restore onion/i }))
  expect(onRestore).toHaveBeenCalledWith('onion', true)
})

it('names silent meals and unavailable recipes', () => {
  render(
    <EmptyWeekExplainer
      {...base}
      diagnostics={{
        hiddenItems: [],
        mealsWithoutIngredients: [{ dishTitle: 'Bare toast', date: '2026-08-11T00:00:00Z', meal: 'Breakfast' }],
        unavailableRecipeCount: 1,
      }}
    />,
  )
  expect(screen.getByText(/Bare toast/)).toBeInTheDocument()
  expect(screen.getByText(/no ingredient list/i)).toBeInTheDocument()
  expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
})

it('points at another week holding items', async () => {
  const onJumpToWeek = vi.fn()
  render(
    <EmptyWeekExplainer
      {...base}
      onJumpToWeek={onJumpToWeek}
      diagnostics={undefined}
      otherWeeks={[{ weekStartDate: '2026-08-17T00:00:00Z', unboughtCount: 12 }]}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: /12 items/i }))
  expect(onJumpToWeek).toHaveBeenCalledWith('2026-08-17T00:00:00Z')
})

it('falls back to the friendly copy when nothing explains the emptiness', () => {
  render(<EmptyWeekExplainer {...base} diagnostics={undefined} />)
  expect(screen.getByText(/plan some meals/i)).toBeInTheDocument()
})
