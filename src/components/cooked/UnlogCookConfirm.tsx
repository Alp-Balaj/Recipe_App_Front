// ─────────────────────────────────────────────────────────────────────────
// "Un-logging one cook never silently destroys its note" (KAN-14, KAN-8's rule
// applied to the row-scoped undo).
//
// A sibling of components/mealplan/UncookConfirm rather than a widening of it,
// and the difference is the SCOPE the copy has to be honest about. That one
// un-cooks a plan SLOT: it deletes every cook recorded there, it knows only how
// MANY notes are at stake, and its copy is careful to speak of "every cook
// recorded here". This one deletes exactly one row, and the row is on screen —
// so it can quote the note it is about to destroy instead of counting it, which
// is the difference between a warning the user can weigh and one they have to go
// and check. Merging the two would mean one component claiming both.
//
// Like its sibling it takes the note rather than an `open` flag: there is no
// version of this dialog that renders for nothing to lose. A cook with no note
// is un-logged straight away — a confirmation on every un-log would wreck a
// one-tap gesture, which is the whole of KAN-8's reasoning and not a shortcut.
//
// Presentational: it names the cost and reports the answer. Whether to ask, and
// what to do with the answer, belongs to the page.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import Modal from '@/components/ui/Modal'

const ERROR_COLOR = '#d9534f'

interface Props {
  /** The dish this cook was of — named, so the dialog is about a meal and not "an item". */
  dishTitle: string
  /** What would be lost. Never empty: the caller does not open this dialog otherwise. */
  note: string
  /** Dismiss and change nothing. */
  onCancel: () => void
  /** Go ahead: remove this one cook, note and all. */
  onConfirm: () => void
}

export default function UnlogCookConfirm({ dishTitle, note, onCancel, onConfirm }: Props) {
  return (
    // The dish goes in the LABEL as well as the body: aria-label overrides the
    // panel's contents as the dialog's accessible name, so a generic string here
    // would be the one thing a screen reader is guaranteed to announce.
    <Modal variant="center" label={`Remove this cook of ${dishTitle}?`} onClose={onCancel}>
      <div style={card}>
        <div style={heading}>Remove this cook of {dishTitle}?</div>
        <div style={bodyText}>
          The note you left on it goes too, and that can&rsquo;t be undone. Your other cooks of
          this dish are untouched.
        </div>
        {/* The note itself, quoted. The point of showing it rather than saying
            "a note": the user wrote it, possibly months ago, and is being asked
            whether it is worth keeping — a question nobody can answer from a
            count. Clamped so a 500-character note cannot push the buttons off a
            phone screen. */}
        <blockquote style={quote}>“{note}”</blockquote>
        <div style={{ display: 'flex', gap: 10 }}>
          {/* Destructive first, matching the house's other two confirmations, and
              it says what it destroys rather than "OK". */}
          <button type="button" onClick={onConfirm} style={destructiveButton}>
            Delete the note
          </button>
          {/* autoFocus, load-bearing exactly as in UncookConfirm: Modal focuses
              the first focusable element in DOM order, which is the destructive
              button above, so without this the keyboard's default answer is
              "destroy" — one Enter auto-repeat away from the press that opened
              the dialog. Modal yields to a self-focused element on open. */}
          <button type="button" autoFocus onClick={onCancel} style={keepButton}>
            Keep it
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
  marginBottom: 12,
}

const quote: CSSProperties = {
  margin: '0 0 16px',
  padding: '10px 12px',
  borderLeft: '3px solid var(--border)',
  borderRadius: '0 10px 10px 0',
  background: 'var(--surface2)',
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--text)',
  lineHeight: 1.45,
  maxHeight: 120,
  overflowY: 'auto',
  overflowWrap: 'anywhere',
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
