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

it('names silent meals', () => {
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
})

// KAN-1: the unavailable-recipe copy left this component for UnavailableRecipesNotice,
// which the page renders in its banners whether or not the list is empty. Rendering it
// here too would print the same sentence twice on an empty week.
it('leaves the unavailable-recipe copy to the page-level notice', () => {
  render(
    <EmptyWeekExplainer
      {...base}
      diagnostics={{ hiddenItems: [], mealsWithoutIngredients: [], unavailableRecipeCount: 2 }}
    />,
  )
  expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument()
  // But it is still a REASON, so the week must not fall through to "plan some meals" —
  // which would contradict the notice sitting directly above it.
  expect(screen.queryByText(/plan some meals/i)).not.toBeInTheDocument()
  // And it must not render an EMPTY div either. The page hides its add-item form under
  // `total === 0`, so with every other branch silent the screen would be a banner and a
  // blank — no heading, no next step. Suppressing the two strings above is not enough.
  expect(screen.getByText(/nothing else to buy/i)).toBeInTheDocument()
})

// The "next step" copy must not point at the manual add form: ShoppingListPage hides that
// under `total === 0`, which is exactly the state this component renders in.
it('does not point at an add form the page has hidden', () => {
  render(
    <EmptyWeekExplainer
      {...base}
      diagnostics={{ hiddenItems: [], mealsWithoutIngredients: [], unavailableRecipeCount: 1 }}
    />,
  )
  expect(screen.getByText(/nothing else to buy/i).textContent).not.toMatch(/above/i)
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
