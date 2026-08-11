import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UncookConfirm from './UncookConfirm'

// The dialog is a leaf, rendered directly rather than through the day page: the
// page test proves it is asked for at the right moment, and this proves what it
// SAYS when it is. The count is the whole reason the read carries a number
// instead of a flag, and it only shows above one — which the page test, driving
// a single-note fixture, structurally cannot see.
//
// MealCard is deliberately absent from this file. It renders the ✓ Cooked button
// and calls back; it decides nothing about notes, and giving it a say here would
// put a decision in the one component on this surface whose contract is that it
// holds none.

function renderConfirm(props: { noteCount?: number; onCancel?: () => void; onConfirm?: () => void } = {}) {
  return render(
    <UncookConfirm
      dishTitle="Shakshuka"
      noteCount={props.noteCount ?? 1}
      onCancel={props.onCancel ?? (() => {})}
      onConfirm={props.onConfirm ?? (() => {})}
    />,
  )
}

describe('the un-cook confirmation', () => {
  it('names the single note it would delete', async () => {
    renderConfirm({ noteCount: 1 })

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/a note/i)).toBeInTheDocument()
    // Singular throughout: a dialog that says "1 notes" reads as a bug and
    // undermines the warning it exists to give.
    expect(within(dialog).queryByText(/1 notes/i)).not.toBeInTheDocument()
  })

  it('counts the notes when a slot was cooked and annotated more than once', async () => {
    renderConfirm({ noteCount: 3 })

    const dialog = screen.getByRole('dialog')
    // "3 notes", not "a note" — the number is what lets the user weigh the
    // interruption instead of going to check what is at stake. getAllByText:
    // the sentence and the button both carry it, which is the point.
    expect(within(dialog).getAllByText(/3 notes/i).length).toBeGreaterThan(0)
    expect(within(dialog).queryByText(/a note/i)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /delete the 3 notes/i })).toBeInTheDocument()
  })

  it('reports the answer and acts on nothing itself', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderConfirm({ onCancel, onConfirm })

    await userEvent.click(screen.getByRole('button', { name: /keep/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // Still exactly one cancel: confirming is not also a dismissal the page has
    // to de-duplicate. Closing the dialog is the page's move, not this one's.
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  /**
   * Modal focuses the first focusable element in DOM order when it opens, and the
   * destructive button is rendered first so it reads first. Left alone, that puts
   * the keyboard's default answer on "delete": the user presses Enter to activate
   * "✓ Cooked", the dialog mounts under the still-held key, and auto-repeat — or a
   * second deliberate Enter — confirms the destruction the dialog exists to
   * prevent. The safe answer has to be the one already under the finger.
   */
  it('opens with the safe answer focused, not the destructive one', async () => {
    renderConfirm()

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /keep/i }))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /delete/i }))
  })

  /**
   * `aria-label` on the panel OVERRIDES its contents as the dialog's accessible
   * name, so a generic label is the one thing a screen reader is guaranteed to
   * announce — and it would name neither the dish nor the count, which is the
   * component's whole reason for taking them.
   */
  it('names the dish in the dialog itself, not just in its body copy', async () => {
    renderConfirm()

    expect(screen.getByRole('dialog', { name: /shakshuka/i })).toBeInTheDocument()
  })

  /**
   * Un-cooking deletes EVERY cook logged against the slot, not only the annotated
   * ones — `cookNoteCount` counts notes, and a slot cooked three times with one
   * note loses three cooks. The copy must not quietly assert a cook count it was
   * never given: "a note against this cook" reads as "one cook", and that is a
   * claim this component cannot make.
   */
  it('does not claim a number of cooks it was never told', async () => {
    renderConfirm({ noteCount: 1 })

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText(/this cook\b/i)).not.toBeInTheDocument()
    // …and it says the un-tick takes the unannotated cooks too, so the cost the
    // user is weighing is the whole cost.
    expect(within(dialog).getByText(/every cook/i)).toBeInTheDocument()
  })

  it('treats Escape as keeping the notes, not as deleting them', async () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    renderConfirm({ onCancel, onConfirm })

    await userEvent.keyboard('{Escape}')

    // The dismissal every dialog gets for free must land on the SAFE side of a
    // destructive question — Modal routes it to onClose, so onClose has to be
    // the cancel.
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
