import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import CarryoverBanner from './CarryoverBanner'
import type { ShoppingCarryover } from '@/api/shopping'

const carryover: ShoppingCarryover = {
  weekStartDate: '2026-08-03T00:00:00Z',
  items: [
    { key: 'onion', displayName: 'Onion', remainingDisplay: '2 pcs', origin: 'Derived', manualItemId: null },
    { key: 'manual:1', displayName: 'Batteries', remainingDisplay: null, origin: 'Manual', manualItemId: '1' },
  ],
}
const noop = () => {}

it('summarises the debt and expands to per-item actions', async () => {
  const onCarry = vi.fn()
  render(
    <CarryoverBanner
      carryover={carryover}
      onCarry={onCarry}
      onDismiss={noop}
      onCarryAll={noop}
      onDismissAll={noop}
      isPending={false}
    />,
  )
  expect(screen.getByText(/last week had 2 unbought items/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /show items/i }))
  await userEvent.click(screen.getByRole('button', { name: /carry onion/i }))
  expect(onCarry).toHaveBeenCalledWith(carryover.items[0])
})

it('offers carry-all and dismiss-all', async () => {
  const onCarryAll = vi.fn()
  const onDismissAll = vi.fn()
  render(
    <CarryoverBanner
      carryover={carryover}
      onCarry={noop}
      onDismiss={noop}
      onCarryAll={onCarryAll}
      onDismissAll={onDismissAll}
      isPending={false}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: /carry all/i }))
  expect(onCarryAll).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
  expect(onDismissAll).toHaveBeenCalled()
})

it('expands to reveal a skip action per item, and disables every button while pending', async () => {
  const { rerender } = render(
    <CarryoverBanner
      carryover={carryover}
      onCarry={noop}
      onDismiss={noop}
      onCarryAll={noop}
      onDismissAll={noop}
      isPending={false}
    />,
  )
  // Expand while not pending, then flip isPending — a mutation firing from one
  // row must not slam the banner shut, only grey out its buttons.
  await userEvent.click(screen.getByRole('button', { name: /show items/i }))
  rerender(
    <CarryoverBanner
      carryover={carryover}
      onCarry={noop}
      onDismiss={noop}
      onCarryAll={noop}
      onDismissAll={noop}
      isPending
    />,
  )
  expect(screen.getByRole('button', { name: /skip onion/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /carry all/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /^dismiss$/i })).toBeDisabled()
  expect(screen.getByRole('button', { name: /hide items/i })).toBeDisabled()
})

it('toggles the expand label between show and hide', async () => {
  render(
    <CarryoverBanner
      carryover={carryover}
      onCarry={noop}
      onDismiss={noop}
      onCarryAll={noop}
      onDismissAll={noop}
      isPending={false}
    />,
  )
  const toggle = screen.getByRole('button', { name: /show items/i })
  await userEvent.click(toggle)
  expect(screen.getByRole('button', { name: /hide items/i })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /hide items/i }))
  expect(screen.getByRole('button', { name: /show items/i })).toBeInTheDocument()
})
