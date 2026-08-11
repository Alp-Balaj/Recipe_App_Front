// ─────────────────────────────────────────────────────────────────────────
// "Add a cook" — recording a meal you already made (KAN-6).
//
// This is what makes Cooked trustworthy. Without it the collection quietly omits
// every cook the app did not happen to observe, and the dishes most worth adding
// are exactly the ones it never saw: old favourites, cooked long before anyone
// opened this app.
//
// Two steps, and the order is the point. You pick the DISH first, because that
// is the thing you have to search for and the thing you might not find; the day
// is a two-second answer you give once you know it is worth giving. Asking for
// the date first would make a user commit to a day before knowing whether the
// recipe is even here.
//
// The picker is PickerContent — the same one the meal planner uses, unchanged
// apart from which lens it opens on. Its "All" segment reaches every recipe the
// user can SEE, not just their saved ones, which the ticket calls out
// specifically: a saved-only corpus fails the exact case this feature exists for.
//
// One known limit, and it is the picker's rather than this panel's: PickerContent
// filters the pages it has already loaded instead of asking the server. GET
// /recipes DOES take `?search=` (Postgres websearch_to_tsquery) and BrowsePage
// has used it since open-loops slice 2 — the picker simply predates that and was
// never moved over. So a dish deep in a large public corpus needs "Show more"
// before it can be typed for. That is exactly the "silently lossy" failure
// BrowsePage's own comment describes, and it is tracked separately rather than
// fixed here, because making search behave the same across the picker's personal
// segments (which are bounded in-memory corpora) is a design question of its own.
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
import Modal from '@/components/ui/Modal'
import PickerContent from '@/components/mealplan/PickerContent'
import { useCookLogMutations } from '@/hooks/useCookLog'

interface Props {
  onClose: () => void
  /** Fired once the cook has landed, so the opener can say so. */
  onAdded?: (title: string) => void
}

interface Chosen {
  id: string
  title: string
}

export default function AddCookPanel({ onClose, onAdded }: Props) {
  const [chosen, setChosen] = useState<Chosen | null>(null)

  return (
    <Modal onClose={onClose} label="Add a cook" variant="sheet">
      {chosen ? (
        <WhenForm chosen={chosen} onBack={() => setChosen(null)} onClose={onClose} onAdded={onAdded} />
      ) : (
        <PickerContent
          question="What did you cook?"
          subtitle="Adding to Cooked"
          variant="sheet"
          // Not "your recipes". The whole point of this picker being here is
          // that it reaches everything you can see — the dish you are trying to
          // record is very likely one you never saved, which is why it is
          // missing from Cooked in the first place.
          searchLabel="Search all recipes"
          // Open on All rather than the planner's "what you cooked before". The
          // dish being recorded is, by definition, one Cooked does not have —
          // very often one the user never saved either — so every personal lens
          // is the wrong place to start looking for it.
          defaultSegment="all"
          onClose={onClose}
          // The title comes from the row the user was looking at, so the next
          // step names the dish they picked rather than making them wait for a
          // round trip to learn something that was already on screen.
          onPick={(recipeId, recipe) => setChosen({ id: recipeId, title: recipe.title })}
        />
      )}
    </Modal>
  )
}

function WhenForm({
  chosen,
  onBack,
  onClose,
  onAdded,
}: {
  chosen: Chosen
  onBack: () => void
  onClose: () => void
  onAdded?: (title: string) => void
}) {
  const { log } = useCookLogMutations()
  const [day, setDay] = useState(todayInputValue)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

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
        onSuccess: () => {
          onAdded?.(chosen.title)
          onClose()
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
        <button type="button" style={ghostButton} onClick={onBack}>
          Change
        </button>
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
        <button type="button" style={ghostButton} onClick={onClose}>
          Cancel
        </button>
        <button type="button" style={primaryButton} disabled={!day || log.isPending} onClick={submit}>
          {log.isPending ? 'Adding…' : 'Add cook'}
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
