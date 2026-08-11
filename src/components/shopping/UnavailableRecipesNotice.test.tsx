import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import UnavailableRecipesNotice from './UnavailableRecipesNotice'

it('says nothing when every planned recipe is still available', () => {
  const { container } = render(<UnavailableRecipesNotice count={0} />)
  expect(container).toBeEmptyDOMElement()
})

it('explains why the list is short', () => {
  render(<UnavailableRecipesNotice count={1} />)
  expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
  // The point of the copy: not just "something is missing" but "and that is why your
  // list does not have its ingredients on it".
  expect(screen.getByText(/aren't on this list/i)).toBeInTheDocument()
})

it('agrees with itself on more than one', () => {
  render(<UnavailableRecipesNotice count={3} />)
  expect(screen.getByText(/3 planned meals' recipes are no longer available/i)).toBeInTheDocument()
})

// ADR-0001 / KAN-2: "removed" and "no longer shared with you" are ONE user-visible state.
// The server sends a single count for both deliberately, because naming the second reports
// an author's private visibility decision to a stranger — which is the leak itself. This
// fails if any future copy edit reaches for a cause, or for the dish's withheld title.
it('never names a cause or a dish', () => {
  const { container } = render(<UnavailableRecipesNotice count={2} />)
  const copy = container.textContent ?? ''
  for (const forbidden of ['delet', 'remov', 'privat', 'hidden', 'unshared', 'author']) {
    expect(copy.toLowerCase()).not.toContain(forbidden)
  }
})
