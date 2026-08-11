// ─────────────────────────────────────────────────────────────────────────
// One cook's note, read and written in place (KAN-5, design D10).
//
// Before this, the only place a note could be written was /plan's
// rate-your-last-cook card, and only for the MOST RECENT cook — so every older
// note was unreachable and uneditable anywhere in the app. The useful note is
// often the one thought of the next morning, not while the pan is still hot.
//
// Three rules the component keeps:
//
//   - Clearing sends NULL, not ''. "Cleared" has one representation: the server
//     normalises blank to null on the way in so a written-then-cleared note
//     falls back to the previous one on the dish row, and sending '' would lean
//     on that normalisation instead of stating the intent.
//   - The length cap is the SERVER's (CookLog.Note is HasMaxLength(500) and the
//     validator enforces it), so a longer note is a 400 discovered only after
//     typing it. Same number, enforced before submitting.
//   - A failed save keeps the editor open with the typed text intact. A page
//     about keeping notes must never lose one quietly.
//
// Editing stays available when the recipe is unavailable: annotating your own
// cook is a write on your own row, which ADR-0001 leaves ungated.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'

/** CookLog.Note is HasMaxLength(500); UpdateCookNoteRequestValidator enforces it. */
export const NOTE_MAX_LENGTH = 500

interface Props {
  note: string | null | undefined
  /** Resolves when the note is stored; rejects to keep the editor open. */
  onSave: (note: string | null) => Promise<unknown>
}

export default function CookNote({ note, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)

  const open = () => {
    setDraft(note ?? '')
    setFailed(false)
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    setFailed(false)
    try {
      // Trim, then null: whitespace is not a note, and the two clients that can
      // write one must agree on what "empty" is.
      const trimmed = draft.trim()
      await onSave(trimmed === '' ? null : trimmed)
      setEditing(false)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div style={readRow}>
        {note ? <span style={noteText}>{note}</span> : <span style={placeholder}>No note</span>}
        <button type="button" onClick={open} style={editButton}>
          {note ? 'Edit note' : 'Add a note'}
        </button>
      </div>
    )
  }

  return (
    <div style={editor}>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          if (failed) setFailed(false)
        }}
        maxLength={NOTE_MAX_LENGTH}
        rows={2}
        placeholder="What did you think? — dough needs a longer rest…"
        aria-label="Note about this cook"
        style={field}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void save()} disabled={saving} style={saveButton}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false)
            setFailed(false)
          }}
          disabled={saving}
          style={cancelButton}
        >
          Cancel
        </button>
        {/* The MESSAGE is the alert, not the editor around it: an alert region
            wrapping the textarea would have a screen reader re-announce the
            whole editor, including the text the user is still holding. */}
        {failed && (
          <span role="alert" style={failure}>
            Couldn&rsquo;t save that. Try again.
          </span>
        )}
      </div>
    </div>
  )
}

const readRow: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
}

const noteText: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.45,
}

const placeholder: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 13,
  fontStyle: 'italic',
  color: 'var(--navidle)',
}

const editButton: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  flexShrink: 0,
}

const editor: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const field: CSSProperties = {
  width: '100%',
  resize: 'vertical',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--surface2)',
  padding: '9px 11px',
  fontFamily: 'inherit',
  fontSize: 13,
  color: 'var(--text)',
}

const saveButton: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 12,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  padding: '8px 16px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
}

const cancelButton: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--surface)',
  color: 'var(--muted)',
  padding: '8px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
}

const failure: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--clay)',
}
