import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

/** A trigger button that opens a Modal — mirrors how the pages use it. */
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <Modal label="Test dialog" onClose={() => setOpen(false)}>
          <button>Inside action</button>
        </Modal>
      )}
    </>
  )
}

/** Same, but the panel content autofocuses itself — mirrors the edit form's Title field. */
function AutoFocusHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <Modal label="Test dialog" onClose={() => setOpen(false)}>
          <input aria-label="Title" autoFocus />
        </Modal>
      )}
    </>
  )
}

describe('Modal', () => {
  it('exposes real dialog semantics (role="dialog" + aria-modal)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Open dialog'))
    const dialog = screen.getByRole('dialog', { name: 'Test dialog' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('moves focus into the dialog on open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Open dialog'))
    expect(screen.getByText('Inside action')).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger', async () => {
    render(<Harness />)
    const trigger = screen.getByText('Open dialog')
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('restores focus to the trigger even when the panel autofocuses a field', async () => {
    render(<AutoFocusHarness />)
    const trigger = screen.getByText('Open dialog')
    await userEvent.click(trigger)
    expect(screen.getByLabelText('Title')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('closes on a backdrop click but not on a click inside the panel', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByText('Open dialog'))

    // Click inside the panel — stays open.
    await userEvent.click(screen.getByText('Inside action'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Click the backdrop (the dialog's parent) — closes.
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement
    await userEvent.click(backdrop)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
