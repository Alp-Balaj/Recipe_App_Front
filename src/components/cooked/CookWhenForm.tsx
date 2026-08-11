// ─────────────────────────────────────────────────────────────────────────
// "When did you make it?" — the backdating step, on its own (KAN-6, extracted
// for KAN-7).
//
// Two flows reach it now and they arrive from opposite directions. "Add a cook"
// on /cooked knows the day is coming and has to ask which DISH first, so its
// back button goes to the dish picker and reads "Change". KAN-7's prompt on the
// recipe page already knows the dish — the user is standing on it — so its back
// button goes to Today-or-a-date and reads "Back": there is no dish to change,
// and offering to change one would be offering something that does not exist.
//
// It lives here rather than inside AddCookPanel because the alternative was a
// second date field: the same bounds, the same midday conversion, the same
// server sentence to show, written twice and free to disagree the first time
// either changed.
//
// The DATE BOUNDS are the server's, not this component's, and deliberately so.
// The ceiling is mirrored here as the input's `max` because a date picker that
// offers next week and then refuses it is a worse control than one that does not
// offer it. The FLOOR — nothing before your account existed — is not mirrored,
// because the client is not told when the account was created, and inventing a
// floor from something else would be a guess that disagrees with the server. It
// arrives as a 400 carrying the sentence to show, which is what `errorMessage`
// below exists for.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { ApiError, ApiValidationError } from '@/api/client'
import { middayUtc } from '@/api/cookLog'
import { useCookLogMutations } from '@/hooks/useCookLog'

/** The dish being recorded — id to write, title to name it back to the user. */
export interface ChosenDish {
  id: string
  title: string
}

interface Props {
  chosen: ChosenDish
  /**
   * Returns to whatever step came before this one. Omit when nothing did.
   *
   * Its label is the caller's because what "back" MEANS differs: from "Add a
   * cook" it goes back to the dish picker, so it reads "Change" and is about the
   * dish above it; from the rating prompt the dish is fixed and there is nothing
   * to change, so a "Change" there would offer something that does not exist.
   */
  onBack?: () => void
  backLabel?: string
  /** Backs out without writing anything. */
  onCancel: () => void
  /**
   * The cook landed. The caller decides what happens next — say so, or rate it.
   *
   * AWAITED, and the submit button stays busy for the whole of it. Whatever
   * follows a cook is a second write that can take a moment (KAN-7 rates the
   * dish), and re-enabling the button in the gap would offer "Add cook" as the
   * retry for something else's failure — logging a second cook to fix a rating.
   *
   * A rejection is the caller's to handle for the same reason: this form cannot
   * retry it, because its own action is the one thing that must not happen twice.
   */
  onLogged: () => unknown
  /** Overridden by KAN-7, where recording the cook is a step on the way to rating. */
  submitLabel?: string
  pendingLabel?: string
}

export default function CookWhenForm({
  chosen,
  onBack,
  backLabel = 'Change',
  onCancel,
  onLogged,
  submitLabel = 'Add cook',
  pendingLabel = 'Adding…',
}: Props) {
  const { log } = useCookLogMutations()
  const [day, setDay] = useState(todayInputValue)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The handoff is part of the submission from the user's side, so the button
  // has to stay busy across it — see `onLogged`.
  const [handingOff, setHandingOff] = useState(false)
  const busy = log.isPending || handingOff

  const submit = () => {
    setError(null)
    log.mutate(
      {
        recipeId: chosen.id,
        // A DAY, not a moment — middayUtc is the only supported way to build
        // this, and its doc comment says why every obvious alternative files the
        // cook under the wrong date.
        past: { cookedAt: middayUtc(day), note: note.trim() || null },
      },
      {
        onSuccess: async () => {
          setHandingOff(true)
          try {
            await onLogged()
          } finally {
            setHandingOff(false)
          }
        },
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  return (
    <div style={form}>
      <div style={headerRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={question}>When did you make it?</h2>
          <div style={dish}>{chosen.title}</div>
        </div>
        {onBack && (
          <button type="button" style={ghostButton} onClick={onBack}>
            {backLabel}
          </button>
        )}
      </div>

      <label style={field}>
        <span style={label}>Day</span>
        <input
          type="date"
          value={day}
          // Today in the user's OWN calendar. Always within the server's ceiling,
          // which allows one day past UTC today so that people east of the date
          // line can record the dinner they are eating right now.
          max={todayInputValue()}
          onChange={(e) => {
            setDay(e.target.value)
            setError(null)
          }}
          style={input}
        />
      </label>

      <label style={field}>
        <span style={label}>Note (optional)</span>
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          placeholder="How did it go?"
          onChange={(e) => setNote(e.target.value)}
          style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </label>

      {error && (
        <div role="alert" style={errorText}>
          {error}
        </div>
      )}

      <div style={actions}>
        <button type="button" style={ghostButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" style={primaryButton} disabled={!day || busy} onClick={submit}>
          {busy ? pendingLabel : submitLabel}
        </button>
      </div>
    </div>
  )
}

/** Today as an `<input type="date">` value, in the reader's own calendar. */
function todayInputValue(): string {
  const now = new Date()
  const month = `${now.getMonth() + 1}`.padStart(2, '0')
  const day = `${now.getDate()}`.padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * The server's sentence, preferred over anything this file could write.
 *
 * Both date bounds come back as a 400 keyed on `cookedAt`, and the two
 * corrections are genuinely different — "that day has not happened" and "your
 * account did not exist then" send the user to different fixes. Substituting one
 * generic message for both would throw that away, and the floor in particular is
 * a rule this client cannot even restate, because it is never told the date.
 */
function errorMessage(error: unknown): string {
  if (error instanceof ApiValidationError) {
    return Object.values(error.errors)[0]?.[0] ?? 'That date cannot be used.'
  }
  if (error instanceof ApiError && error.status === 404) {
    return "That recipe isn't available any more."
  }
  return 'Could not add that cook. Try again.'
}

const form: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 0,
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
}

const question: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  margin: 0,
  lineHeight: 1.2,
}

const dish: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 13.5,
  color: 'var(--muted)',
  marginTop: 4,
}

const field: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const label: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const input: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
  background: 'var(--inputbg)',
  color: 'var(--text)',
}

const errorText: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--clay)',
}

const actions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}

const ghostButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '8px 14px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}

const primaryButton: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 10,
  padding: '8px 16px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 800,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}
