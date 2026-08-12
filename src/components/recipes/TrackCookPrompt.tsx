// ─────────────────────────────────────────────────────────────────────────
// "You cooked this before? Track it." (KAN-7)
//
// What the user did was tap a star. This asks for the one thing a rating now
// needs and does not have — a cook — and then finishes the gesture they made,
// so a star tap is never a dead end.
//
// It opens on the SERVER's refusal rather than on anything the page believed,
// and it stays that way. When this was written the page COULD NOT answer "has
// this reader cooked this" — `cookedByMe` was row existence, a different
// question. KAN-13 made it exactly the predicate the server rates on, so the
// page could now often pre-empt the refusal; it deliberately does not. The flag
// is still null on any surface that was never seeded, a cache patch can still be
// in flight, and a prompt that opens on a guess is wrong exactly when it matters.
// Asking and being told is one round trip and is never wrong — the reasoning
// recorded in the backend's ADR-0004, unchanged by ADR-0005.
//
// Today is the primary action because it is the true answer nearly every time —
// the star was tapped by someone who just ate the thing. "Pick a date" is the
// same backdating flow /cooked's "Add a cook" uses, reached with the dish
// already chosen, because the user is standing on it.
//
// Backing out writes NOTHING. That is not just tidiness: the rating that opened
// this was rolled back when the server refused it, so a dismissal leaves the
// recipe exactly as it was found — no cook, no rating, no half-made dish.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import Modal from '@/components/ui/Modal'
import CookWhenForm, { type ChosenDish } from '@/components/cooked/CookWhenForm'
import { useCookLogMutations } from '@/hooks/useCookLog'

interface Props {
  recipe: ChosenDish
  /** Dismissed. Nothing has been written and nothing should be. */
  onClose: () => void
  /**
   * A cook landed — the caller applies the rating that opened this, and closes
   * this prompt when it succeeds. Rejects if the rating did not go through, and
   * calling it again retries ONLY the rating.
   */
  onCooked: () => Promise<void>
}

/**
 * The two halves of the gesture, and why they are separate states rather than
 * one "submitting" flag: past the first, the cook is on the server. A retry
 * offered from the cook step would log a second one.
 */
type Step = 'choice' | 'date' | 'ratingFailed'

export default function TrackCookPrompt({ recipe, onClose, onCooked }: Props) {
  const [step, setStep] = useState<Step>('choice')

  // The prompt stays up until the RATING lands, not until the cook does. Half a
  // gesture that closes looks exactly like a whole one: the cook is recorded,
  // the star the user tapped is not, and there is nothing on screen to say so.
  const applyRating = async (): Promise<boolean> => {
    try {
      await onCooked()
      return true
    } catch {
      setStep('ratingFailed')
      return false
    }
  }

  return (
    <Modal onClose={onClose} label="Track this cook" variant="sheet">
      {step === 'date' && (
        <CookWhenForm
          chosen={recipe}
          // Back to Today-or-a-date, NOT to a dish picker — there is no dish
          // picker here and no dish to change, which is why the label is the
          // caller's rather than the form's default "Change".
          onBack={() => setStep('choice')}
          backLabel="Back"
          onCancel={onClose}
          onLogged={applyRating}
          // Named for what the button actually does. The rating is applied the
          // moment the cook lands, and a label that mentioned only the cook
          // would leave the user wondering whether their star survived.
          submitLabel="Add cook and rate"
        />
      )}

      {step === 'choice' && (
        <Choice recipe={recipe} onClose={onClose} onCooked={applyRating} onPickDate={() => setStep('date')} />
      )}

      {step === 'ratingFailed' && (
        <RatingFailed title={recipe.title} onRetry={applyRating} onClose={onClose} />
      )}
    </Modal>
  )
}

function Choice({
  recipe,
  onClose,
  onCooked,
  onPickDate,
}: {
  recipe: ChosenDish
  onClose: () => void
  /** Applies the rating. Never rejects — the parent turns a failure into a step. */
  onCooked: () => Promise<unknown>
  onPickDate: () => void
}) {
  const { log } = useCookLogMutations()
  const [error, setError] = useState<string | null>(null)
  // Stays busy across the rating too, for the reason CookWhenForm's `onLogged`
  // gives: once the cook has landed, this button's own action is the one thing
  // that must not be pressed a second time.
  const [rating, setRating] = useState(false)
  const busy = log.isPending || rating

  // Today goes through the SAME mutation the dated branch uses, with no date —
  // which the cook log reads as "now" (see PastCookFields). One write path, so
  // the two branches cannot end up producing different kinds of cook, and the
  // caches both of them touch are invalidated in one place.
  const today = () => {
    setError(null)
    log.mutate(
      { recipeId: recipe.id },
      {
        onSuccess: async () => {
          setRating(true)
          try {
            await onCooked()
          } finally {
            setRating(false)
          }
        },
        // Deliberately does NOT close: the rating is still unwritten, and
        // dropping the sheet on a failure would leave the user with a star that
        // went back off and no idea why.
        onError: () => setError('Could not record that cook. Try again.'),
      },
    )
  }

  return (
    <div style={panel}>
      <h2 style={question}>You cooked this before?</h2>
      <div style={body}>
        Track it — a rating belongs to a dish you have made. <span style={dish}>{recipe.title}</span>
      </div>

      {error && (
        <div role="alert" style={errorText}>
          {error}
        </div>
      )}

      <button type="button" style={primaryButton} disabled={busy} onClick={today}>
        {busy ? 'Recording…' : 'Today'}
      </button>
      <button type="button" style={secondaryButton} disabled={busy} onClick={onPickDate}>
        Pick a date
      </button>
      <button type="button" style={ghostButton} disabled={busy} onClick={onClose}>
        Not now
      </button>
    </div>
  )
}

/**
 * The cook is on the server and the rating is not — the one outcome of this flow
 * that neither step above can recover, because the retry each of them offers is
 * "record the cook", which would record a second.
 *
 * It says the cook survived before offering anything, because that is the part
 * the user would otherwise assume they had lost.
 */
function RatingFailed({
  title,
  onRetry,
  onClose,
}: {
  title: string
  /** Resolves false when the rating failed again — true means this is unmounting. */
  onRetry: () => Promise<boolean>
  onClose: () => void
}) {
  const [retrying, setRetrying] = useState(false)

  const retry = async () => {
    setRetrying(true)
    // Only cleared on a failure. A success unmounts this panel, and the boolean
    // is what lets it tell the two apart rather than setting state on the way out.
    if (!(await onRetry())) setRetrying(false)
  }

  return (
    <div style={panel}>
      <h2 style={question}>Your cook is recorded.</h2>
      <div style={body} role="alert">
        The rating didn&rsquo;t go through. Nothing else is lost — try again, or leave it and rate{' '}
        <span style={dish}>{title}</span> later.
      </div>

      <button type="button" style={primaryButton} disabled={retrying} onClick={retry}>
        {retrying ? 'Rating…' : 'Try again'}
      </button>
      <button type="button" style={ghostButton} disabled={retrying} onClick={onClose}>
        Leave it
      </button>
    </div>
  )
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minWidth: 0,
}

const question: CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  letterSpacing: '-0.015em',
  margin: 0,
  lineHeight: 1.2,
}

const body: CSSProperties = {
  fontSize: 14,
  color: 'var(--muted)',
  lineHeight: 1.5,
  marginBottom: 6,
}

const dish: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  color: 'var(--text)',
}

const errorText: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--clay)',
}

const buttonBase: CSSProperties = {
  cursor: 'pointer',
  borderRadius: 12,
  padding: '12px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  width: '100%',
}

const primaryButton: CSSProperties = {
  ...buttonBase,
  border: 'none',
  fontWeight: 800,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

const secondaryButton: CSSProperties = {
  ...buttonBase,
  border: '1px solid var(--border)',
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}

const ghostButton: CSSProperties = {
  ...buttonBase,
  border: 'none',
  fontWeight: 700,
  background: 'none',
  color: 'var(--muted)',
}
