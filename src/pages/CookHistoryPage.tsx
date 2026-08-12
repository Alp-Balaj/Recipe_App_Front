// ─────────────────────────────────────────────────────────────────────────
// /plan/cooks — everything you have cooked, newest first (plan-page redesign).
//
// Where /plan's "All N cooks ›" lands. Deliberately a plain dated list rather
// than a feed of cards: this is a record you scan for a dish or a note, not
// something to browse, and the one prompt worth answering (rate the last cook)
// already lives on /plan.
//
// A row whose recipe has since become unavailable still renders — the title is
// snapshotted on the cook, which is the entire reason that column exists. It
// simply stops being a link.
//
// It is also where a single cook is taken back (KAN-14), and this page rather
// than the day page because this is the list that shows cooks which satisfied no
// plan slot. One logged from cook mode on a recipe opened from Discover has no
// entry id, so the day page's tick cannot name it, and the only gesture that
// could reach it was "I have never cooked this" — which erases the dish. Un-log
// removes exactly the row it sits on, and asks first when there is a note on it.
//
// "Unavailable" is ONE state and the copy must keep it that way (KAN-2, design
// D14, docs/adr/0001). A recipe leaves reach either because its author removed
// it or because they stopped sharing it with you, and the server sends a single
// `recipeAvailable: false` for both — on purpose, because naming the second
// cause would report an author's private visibility decision to a stranger.
// This page used to label the row "recipe deleted", which was a guess: for a
// withdrawn recipe it was simply false, and for a removed one it taught users
// to read the badge as a fact about the author. Say only that you cannot open
// it.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useCookHistory, useCookLogMutations } from '@/hooks/useCookLog'
import type { CookLogEntry } from '@/api/cookLog'
import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'
import StateBlock from '@/components/ui/StateBlock'
import UnlogCookConfirm from '@/components/cooked/UnlogCookConfirm'

export default function CookHistoryPage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCookHistory()

  // KAN-14. This page is where the undo lives because it is the surface that
  // lists cooks whether or not they came from a plan slot — the day page's tick
  // can only reach the ones that did, which is the whole of the bug.
  const { unlogOne } = useCookLogMutations()
  const [confirming, setConfirming] = useState<CookLogEntry | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)

  const remove = (row: CookLogEntry) => {
    setConfirming(null)
    setFailedId(null)
    unlogOne.mutate({ id: row.id }, { onError: () => setFailedId(row.id) })
  }

  // Confirm only when there is writing to lose, which is KAN-8's rule rather
  // than a convenience: a dialog on every un-log would wreck a one-tap gesture,
  // and one on the rare occasion that matters earns the interruption. The note
  // travels ON the row here, so — unlike the day page, which reads a separate
  // `cookNoteCount` that fails open when it is absent — there is no way for this
  // check to be answered from a stale or missing count.
  const askOrRemove = (row: CookLogEntry) => {
    if (row.note) {
      setFailedId(null)
      setConfirming(row)
    } else {
      remove(row)
    }
  }

  // Only the row being un-logged loses its control. The server does NOT forgive
  // a repeat — a deleted cook is a 404, not the entry-scoped delete's forgiving
  // 204 — so the double-tap has to be stopped here.
  const pendingId = unlogOne.isPending ? (unlogOne.variables?.id ?? null) : null

  const rows = (data?.pages ?? []).flatMap((page) => page.items)

  return (
    <div className="scroll" style={page}>
      <div style={canvas}>
        <header style={{ marginBottom: 18 }}>
          <Link to="/plan" style={back}>
            ‹ Plan
          </Link>
          <h1 style={title}>Every cook</h1>
          <div style={subtitle}>
            {rows.length > 0
              ? 'Newest first. Notes are yours alone.'
              : 'Cooks land here once you finish one.'}
          </div>
        </header>

        {isError && (
          <StateBlock title="Couldn't load your cooks" body="Check your connection and try again." />
        )}

        {!isError && !isLoading && rows.length === 0 && (
          <StateBlock
            title="Nothing cooked yet"
            body="Finish a recipe in cook mode and it is recorded here."
          />
        )}

        {rows.map((row, index) => (
          <CookRow
            key={row.id}
            row={row}
            last={index === rows.length - 1}
            onUnlog={() => askOrRemove(row)}
            pending={pendingId === row.id}
            failed={failedId === row.id}
          />
        ))}

        {confirming && (
          <UnlogCookConfirm
            dishTitle={confirming.recipeTitle}
            // Non-null by construction: askOrRemove only sets this state for a
            // row that carries a note.
            note={confirming.note!}
            onCancel={() => setConfirming(null)}
            onConfirm={() => remove(confirming)}
          />
        )}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            style={more}
          >
            {isFetchingNextPage ? 'Loading…' : 'Show older cooks'}
          </button>
        )}
      </div>
    </div>
  )
}

function CookRow({
  row,
  last,
  onUnlog,
  pending,
  failed,
}: {
  row: CookLogEntry
  last: boolean
  onUnlog: () => void
  pending: boolean
  failed: boolean
}) {
  const image = row.recipeImageUrl

  const body = (
    <>
      <div
        style={{
          ...thumb,
          ...(image
            ? {
                backgroundImage: `url(${resolveImageUrl(image)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { backgroundImage: gradientFor(row.recipeId || row.recipeTitle) }),
        }}
        role="presentation"
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={dish}>{row.recipeTitle}</span>
        <span style={when}>{longDate(row.cookedAt)}</span>
        {row.note && <span style={note}>“{row.note}”</span>}
      </div>
      {!row.recipeAvailable && <span style={gone}>unavailable</span>}
    </>
  )

  const style: CSSProperties = {
    ...rowStyle,
    // The link/text half only. The row's rule lives on the wrapper below, so it
    // still runs under the un-log control rather than stopping short of it.
    flex: 1,
    minWidth: 0,
  }

  // A dish you can no longer open is still a fact about your week; it just has
  // nowhere to link to.
  const main = row.recipeAvailable ? (
    <Link to={`/recipes/${row.recipeId}`} style={{ ...style, textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  )

  return (
    <div style={last ? undefined : { borderBottom: '1px solid var(--hair)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {main}
        {/*
          A SIBLING of the link, never a child of it. A <button> inside an <a> is
          invalid HTML and behaves like it — the press navigates as well as
          firing, so the row would open the recipe on its way to deleting the
          cook.

          The dish and the date are in the accessible name because the visible
          word is the same on every row: "Un-log" alone leaves a screen-reader
          user choosing between identical controls, on a gesture that destroys
          something. KAN-14.
        */}
        <button
          type="button"
          onClick={onUnlog}
          disabled={pending}
          aria-label={`Un-log ${row.recipeTitle} on ${longDate(row.cookedAt)}`}
          style={unlogButton}
        >
          {pending ? 'Removing…' : 'Un-log'}
        </button>
      </div>
      {/*
        The failure is reported ON the row it belongs to, not as a page-level
        banner: a delete that silently did nothing is the one outcome this
        gesture cannot afford, and "which cook?" is the first thing the user
        asks. The cook stays exactly where it was.
      */}
      {failed && (
        <div role="alert" style={rowError}>
          Couldn&rsquo;t remove that cook. Check your connection and try again.
        </div>
      )}
    </div>
  )
}

function longDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

const page: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '54px 18px 24px',
}

const canvas: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
}

const back: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
}

const title: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 28,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  margin: '6px 0 0',
}

const subtitle: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  marginTop: 6,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 0',
  color: 'inherit',
}

const thumb: CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  flexShrink: 0,
}

const dish: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'var(--text)',
}

const when: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 12.5,
  color: 'var(--muted)',
}

const note: CSSProperties = {
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.45,
}

const gone: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--clay)',
  flexShrink: 0,
}

// Quiet by default and clay only on press — the same weight the rest of the
// page gives its secondary controls. A destructive-red button on every row
// would make a page you scan for a note read as a page of things to delete.
const unlogButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 11,
  padding: '7px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
}

const rowError: CSSProperties = {
  padding: '0 0 12px',
  fontSize: 12.5,
  color: 'var(--clay)',
}

const more: CSSProperties = {
  marginTop: 14,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
}
