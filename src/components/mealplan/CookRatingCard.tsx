// ─────────────────────────────────────────────────────────────────────────
// "How did it go?" — one prompt for the most recent cook (plan-page redesign §3).
//
// Not a feed. The handoff is explicit: one rating prompt for the last cook, and
// the rest of the history behind "All N cooks ›". A history list here would
// turn a page about the week ahead into a page about the month behind.
//
// The two writes are deliberately SEPARATE requests and separate failures:
//
//   - the note goes to PATCH /cook-log/{id}, which increments nothing;
//   - the stars go to the shipped per-recipe rating, so the rating here and the
//     rating on the recipe page are one fact and cannot disagree.
//
// Neither is claimed as saved until it is. A half-succeeded Save reports which
// half — silently swallowing one would leave the user believing they had
// recorded something they had not.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import type { CookLogEntry } from '@/api/cookLog'
import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'

const STARS = [1, 2, 3, 4, 5]

interface Props {
  cook: CookLogEntry
  /** The caller's current rating of this recipe, or null when unrated. */
  myRating: number | null
  onSave: (vars: { note: string | null; rating: number | null }) => Promise<void>
  onCookAgain: () => void
  /** Disabled while the repeat is in flight, so a double tap cannot double-plan. */
  cookAgainPending?: boolean
}

export default function CookRatingCard({
  cook,
  myRating,
  onSave,
  onCookAgain,
  cookAgainPending,
}: Props) {
  const [note, setNote] = useState(cook.note ?? '')
  const [rating, setRating] = useState<number | null>(myRating)
  const [hovered, setHovered] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')

  // Hover/focus previews the fill without committing it — the committed value
  // is what renders the moment the pointer leaves.
  const shown = hovered ?? rating ?? 0

  const save = async () => {
    setStatus('saving')
    try {
      await onSave({ note: note.trim() === '' ? null : note.trim(), rating })
      setStatus('saved')
    } catch {
      setStatus('failed')
    }
  }

  const image = cook.recipeImageUrl

  return (
    <div style={card}>
      <div style={dishRow}>
        <div
          style={{
            ...thumb,
            ...(image
              ? {
                  backgroundImage: `url(${resolveImageUrl(image)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : { backgroundImage: gradientFor(cook.recipeId || cook.recipeTitle) }),
          }}
          role="presentation"
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* The snapshotted title, so this still reads after the recipe is gone. */}
          <span style={dishTitle}>{cook.recipeTitle}</span>
          <span style={cookedWhen}>cooked {whenPhrase(cook.cookedAt)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'flex', gap: 5 }} onMouseLeave={() => setHovered(null)}>
          {STARS.map((star) => {
            const filled = star <= shown
            return (
              <button
                key={star}
                type="button"
                aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
                aria-pressed={rating === star}
                onMouseEnter={() => setHovered(star)}
                onFocus={() => setHovered(star)}
                onBlur={() => setHovered(null)}
                onClick={() => setRating(star)}
                style={{
                  ...starTile,
                  background: filled ? 'var(--surface2)' : 'transparent',
                  color: filled ? 'var(--tagcol)' : 'var(--navidle)',
                }}
              >
                ★
              </button>
            )
          })}
        </span>
        {rating === null && <span style={hint}>tap to rate</span>}
      </div>

      <textarea
        value={note}
        onChange={(event) => {
          setNote(event.target.value)
          if (status !== 'idle') setStatus('idle')
        }}
        maxLength={500}
        rows={2}
        placeholder="Add a note — dough needs a longer rest…"
        aria-label="Note about this cook"
        style={noteField}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={status === 'saving'} style={saveButton}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCookAgain}
          disabled={cookAgainPending || !cook.recipeAvailable}
          // A dish whose recipe is gone can be remembered but not re-planned.
          title={cook.recipeAvailable ? undefined : 'This recipe is no longer available.'}
          style={cookAgain}
        >
          Cook it again ›
        </button>
        {status === 'saved' && (
          <span role="status" style={savedNote}>
            Saved.
          </span>
        )}
        {status === 'failed' && (
          <span role="alert" style={failedNote}>
            Couldn&rsquo;t save that. Try again.
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * "Friday night", "last night", "this morning" — a phrase, not a timestamp.
 *
 * Cooking is remembered by occasion rather than by date, and the exact instant
 * is on /plan/cooks for anyone who wants it.
 */
function whenPhrase(cookedAt: string): string {
  const when = new Date(cookedAt)
  if (Number.isNaN(when.getTime())) return 'recently'

  const partOfDay = when.getHours() < 11 ? 'morning' : when.getHours() < 17 ? 'afternoon' : 'night'

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const daysAgo = Math.floor((startOfToday.getTime() - when.getTime()) / 86_400_000) + 1

  if (daysAgo <= 0) return `this ${partOfDay}`
  if (daysAgo === 1) return partOfDay === 'night' ? 'last night' : `yesterday ${partOfDay}`
  if (daysAgo < 7) {
    return `${when.toLocaleDateString(undefined, { weekday: 'long' })} ${partOfDay}`
  }
  return `on ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '16px 17px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const dishRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}

const thumb: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  overflow: 'hidden',
  flexShrink: 0,
}

const dishTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 17,
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cookedWhen: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 12.5,
  color: 'var(--muted)',
}

const starTile: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 8,
  border: '1px solid var(--border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
}

const hint: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
}

const noteField: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--text)',
  background: 'var(--surface2)',
  resize: 'vertical',
  minWidth: 0,
}

const saveButton: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  fontFamily: 'inherit',
  borderRadius: 12,
  padding: '9px 16px',
  fontSize: 13,
  fontWeight: 800,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
}

const cookAgain: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--muted)',
  padding: 0,
}

const savedNote: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--accent)',
  fontWeight: 700,
}

const failedNote: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--clay)',
  fontWeight: 700,
}
