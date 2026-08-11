// ─────────────────────────────────────────────────────────────────────────
// "Un-cooking never silently destroys a note" (KAN-8).
//
// Un-ticking a cooked meal deletes every cook recorded against that slot, and a
// note belongs to a cook — so the tick that reads like a checkbox has always
// been able to delete writing. That was harmless while a cook was just a tick.
//
// This dialog is the exception, not the rule: the day page fires it ONLY when
// the slot's cooks carry a note. A confirmation on every un-tick would wreck a
// one-tap reversible gesture; a confirmation on the rare occasion that matters
// always earns the interruption. Which is also why this component takes
// `noteCount` and not `open` — there is no version of it that renders for
// nothing to lose.
//
// Presentational, like every other card and panel on these surfaces: it names
// the cost and reports the answer. Whether to ask at all, and what to do with
// the answer, belongs to the page.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import Modal from '@/components/ui/Modal'

const ERROR_COLOR = '#d9534f'

interface Props {
  /** The dish in the slot — named, so the dialog is about a meal and not "an item". */
  dishTitle: string
  /**
   * How many notes would be deleted. Always ≥ 1: the caller does not open this
   * dialog when there is nothing at stake.
   */
  noteCount: number
  /** Dismiss and change nothing. */
  onCancel: () => void
  /** Go ahead: un-cook the slot, notes and all. */
  onConfirm: () => void
}

export default function UncookConfirm({ dishTitle, noteCount, onCancel, onConfirm }: Props) {
  const many = noteCount > 1
  // The number, not just "a note": "2 notes" is the difference between a warning
  // the user can weigh and one they have to go and check.
  const notes = many ? `${noteCount} notes` : 'a note'

  return (
    // The dish goes in the LABEL, not only in the body. aria-label overrides the
    // panel's contents as the dialog's accessible name, so a generic string here
    // would be the one thing a screen reader is guaranteed to announce — naming
    // neither the dish nor the count this component exists to name.
    <Modal variant="center" label={`Un-cook ${dishTitle}?`} onClose={onCancel}>
      <div style={card}>
        <div style={heading}>Un-cook {dishTitle}?</div>
        {/*
          Careful about what this claims. `noteCount` counts NOTES, and un-cooking
          deletes every cook logged against the slot — including the ones nobody
          annotated. A slot cooked three times with one note would lose all three,
          so the copy names the notes it knows about and speaks of the cooks only
          as "every cook", which is true whatever the count turns out to be.
        */}
        <div style={bodyText}>
          {many ? `${notes} are` : `${notes} is`} attached to this meal. Un-cooking deletes every
          cook recorded here and {many ? 'takes the notes' : 'takes the note'} with{' '}
          {many ? 'them' : 'it'} — that can't be undone.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {/*
            Destructive action first, matching the recipe-delete confirmation this
            copies — and it says what it destroys rather than "OK", so the button
            can be read on its own.
          */}
          <button type="button" onClick={onConfirm} style={destructiveButton}>
            Delete {many ? `the ${noteCount} notes` : 'the note'}
          </button>
          {/*
            "Keep" rather than "Cancel": the safe answer here is a thing the user
            wants (their writing), not the absence of an action.

            autoFocus, and it is load-bearing rather than a nicety. Modal focuses
            the first focusable element in DOM ORDER on open, which is the Delete
            button above — so the keyboard's default answer would be "destroy",
            one Enter auto-repeat away from the "✓ Cooked" press that opened this.
            Modal explicitly yields to a field that autofocused itself (see its
            open effect), so this wins without reordering the buttons away from
            the house's destructive-first layout.
          */}
          <button type="button" autoFocus onClick={onCancel} style={keepButton}>
            Keep {many ? 'them' : 'it'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '20px 18px',
}

const heading: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  marginBottom: 6,
  overflowWrap: 'anywhere',
}

const bodyText: CSSProperties = {
  fontSize: 13.5,
  color: 'var(--muted)',
  lineHeight: 1.5,
  marginBottom: 16,
}

const destructiveButton: CSSProperties = {
  flex: 1,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 13,
  padding: '11px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: ERROR_COLOR,
  color: '#fff',
}

const keepButton: CSSProperties = {
  padding: '11px 18px',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--muted)',
}
