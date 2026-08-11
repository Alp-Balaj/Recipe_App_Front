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

import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useCookHistory } from '@/hooks/useCookLog'
import type { CookLogEntry } from '@/api/cookLog'
import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'
import StateBlock from '@/components/ui/StateBlock'

export default function CookHistoryPage() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCookHistory()

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
          <CookRow key={row.id} row={row} last={index === rows.length - 1} />
        ))}

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

function CookRow({ row, last }: { row: CookLogEntry; last: boolean }) {
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
    ...(last ? null : { borderBottom: '1px solid var(--hair)' }),
  }

  // A dish you can no longer open is still a fact about your week; it just has
  // nowhere to link to.
  return row.recipeAvailable ? (
    <Link to={`/recipes/${row.recipeId}`} style={{ ...style, textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
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
