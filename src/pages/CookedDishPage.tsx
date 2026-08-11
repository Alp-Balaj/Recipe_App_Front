// ─────────────────────────────────────────────────────────────────────────
// /cooked/:recipeId — one dish's cooks, and every note left on them (KAN-5).
//
// Its own route (design D9), not a panel on /cooked, so the phone back gesture
// returns to the list rather than closing the app.
//
// This is the surface that makes the cook log's notes usable. Until now the only
// place a note could be written was /plan's rate-your-last-cook card, and only
// for the most recent cook — every older note was unreachable and uneditable
// anywhere in the app, which is the exact opposite of what a record is for.
// Here every cook is annotatable, including one that never had a note (D10).
//
// Two reads, deliberately separate:
//
//   useCookedDish   — the header: title, availability, rating, how many times,
//                     and how many of those the cook log does not hold.
//   useDishCooks    — the cooks themselves, keyset-paged behind "Show older
//                     cooks", the same explicit control /cooked and /plan/cooks
//                     use rather than infinite scroll.
//
// Cooks recorded before the cook log existed (10 August) have no per-cook detail
// at all — the aggregate counts them and there are no rows behind them. They get
// an honest count line, "N cooks before notes existed", and NOT synthetic rows
// (design D12): the cook log is the complete record of every cook it has, and
// fabricated events in it would cost it the one property that makes it worth
// keeping.
//
// A dish whose recipe is unavailable still has this page in full — that is the
// point, since its notes live nowhere else. It simply links nowhere. And
// "unavailable" is ONE state (design D14, ADR-0001): the server sends a single
// flag for "removed" and "no longer shared with you" on purpose, because naming
// the second reports an author's private visibility decision to a stranger.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import type { CookLogEntry } from '@/api/cookLog'
import CookNote from '@/components/cooked/CookNote'
import { cookDate, longDate, timesCooked } from '@/components/cooked/cookedFormats'
import StateBlock from '@/components/ui/StateBlock'
import { useCookedDish } from '@/hooks/useCookedDishes'
import { useCookLogMutations, useDishCooks } from '@/hooks/useCookLog'
import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'

/** A definite "you have no such dish", as opposed to a request that failed. */
function isMissing(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export default function CookedDishPage() {
  const { recipeId = '' } = useParams<{ recipeId: string }>()
  const navigate = useNavigate()
  const dish = useCookedDish(recipeId)
  const cooks = useDishCooks(recipeId)
  const { saveNote } = useCookLogMutations()

  const rows = (cooks.data?.pages ?? []).flatMap((page) => page.items)
  const detail = dish.data

  return (
    <div className="scroll" style={page}>
      <div style={canvas}>
        <header style={{ marginBottom: 18 }}>
          <Link to="/cooked" style={back}>
            ‹ Cooked
          </Link>
          <h1 style={title}>{detail?.dish.title ?? 'This dish'}</h1>
          {detail && (
            <div style={subtitle}>
              {timesCooked(detail.dish.timesCooked)} · last {longDate(detail.dish.lastCookedAt)}
              {detail.dish.rating != null && ` · rated ${detail.dish.rating}/5`}
            </div>
          )}
          {detail?.dish.recipeAvailable === false && <div style={gone}>unavailable</div>}
          {/* A dish you can still open gets the one affordance that needs the
              recipe. An unavailable one gets nothing here rather than a
              disabled link — there is no destination to explain. */}
          {detail?.dish.recipeAvailable && (
            <Link to={`/recipes/${detail.dish.recipeId}`} style={openLink}>
              Open the recipe ›
            </Link>
          )}
        </header>

        {/* A 404 is a definite answer, not a blip: the server 404s exactly the
            dishes /cooked refuses to list (never cooked, rated-only, nothing
            left to title it). Telling that reader to check their connection
            sends them to retry something that will never succeed. */}
        {dish.isError && (
          isMissing(dish.error) ? (
            <StateBlock
              title="This dish isn't in your Cooked list"
              body="Only recipes you have actually cooked appear here."
              action={{ label: 'Back to Cooked', onClick: () => navigate('/cooked') }}
            />
          ) : (
            <StateBlock
              title="Couldn't load this dish"
              body="Check your connection and try again."
              action={{ label: 'Try again', onClick: () => void dish.refetch() }}
            />
          )
        )}

        {!dish.isError && (dish.isLoading || cooks.isLoading) && (
          <StateBlock title="Loading this dish…" body="Fetching every time you made it." />
        )}

        {/* A failed cook-log read with nothing loaded yet takes the surface, and
            must NEVER fall through to the empty state below. "No cooks
            recorded" is a claim about the record, and asserting it because a
            request failed tells the user their notes are gone — the one lie a
            page about keeping notes cannot afford. */}
        {!dish.isError && cooks.isError && rows.length === 0 && (
          <StateBlock
            title="Couldn't load this dish's cooks"
            body="Check your connection and try again."
            action={{ label: 'Try again', onClick: () => void cooks.refetch() }}
          />
        )}

        {/* The cooks the log DOES hold. `listitem` roles come from the <ul>, and
            are what the page's ordering and note assertions hang off. */}
        {rows.length > 0 && (
          <ul style={list}>
            {rows.map((row, index) => (
              <li key={row.id} style={index === rows.length - 1 ? lastItem : item}>
                <CookRow
                  row={row}
                  onSaveNote={(note) => saveNote.mutateAsync({ id: row.id, note })}
                />
              </li>
            ))}
          </ul>
        )}

        {/* D12. Below the real rows, because it describes what is NOT there.
            Rendered whenever the count is non-zero — including when it is the
            only thing on the page, which is the full legacy case: an aggregate
            with no rows behind it at all. */}
        {detail != null && detail.untrackedCooks > 0 && (
          <div style={untracked}>
            {untrackedLine(detail.untrackedCooks)}
            <span style={untrackedWhy}>
              {' '}
              — cooked before this app kept a per-cook record, so there is nothing to annotate.
            </span>
          </div>
        )}

        {/* `!cooks.isError` is load-bearing — see the block above. */}
        {!dish.isError &&
          !cooks.isError &&
          !dish.isLoading &&
          !cooks.isLoading &&
          rows.length === 0 &&
          detail?.untrackedCooks === 0 && (
            <StateBlock
              title="No cooks recorded"
              body="Cooks land here as you finish them, with whatever you thought at the time."
            />
          )}

        {/* An inline failure while paging, so the cooks already on screen — and
            any note half-written among them — survive the blip. */}
        {cooks.isError && rows.length > 0 && (
          <div role="alert" style={pagingError}>
            Couldn&rsquo;t load older cooks.{' '}
            <button type="button" onClick={() => void cooks.fetchNextPage()} style={retryInline}>
              Try again
            </button>
          </div>
        )}

        {cooks.hasNextPage && !cooks.isError && (
          <button
            type="button"
            onClick={() => void cooks.fetchNextPage()}
            disabled={cooks.isFetchingNextPage}
            style={more}
          >
            {cooks.isFetchingNextPage ? 'Loading…' : 'Show older cooks'}
          </button>
        )}
      </div>
    </div>
  )
}

function CookRow({
  row,
  onSaveNote,
}: {
  row: CookLogEntry
  onSaveNote: (note: string | null) => Promise<unknown>
}) {
  const image = row.recipeImageUrl

  return (
    <div style={{ display: 'flex', gap: 12 }}>
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
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* One cook is remembered as an OCCASION, so its date carries the
            weekday — the same call /plan/cooks makes. The header's last-cooked
            date above deliberately does not: see cookedFormats. */}
        <span style={when}>{cookDate(row.cookedAt)}</span>
        {/* Every cook is annotatable, whether or not it already has a note, and
            whether or not the recipe is still open to the caller. */}
        <CookNote note={row.note} onSave={onSaveNote} />
      </div>
    </div>
  )
}

/** "N cooks before notes existed" — the D12 line, verbatim from the design. */
function untrackedLine(count: number): string {
  return count === 1 ? '1 cook before notes existed' : `${count} cooks before notes existed`
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
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 13,
  color: 'var(--muted)',
  marginTop: 6,
}

const gone: CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--clay)',
}

const openLink: CSSProperties = {
  display: 'inline-block',
  marginTop: 10,
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
}

const list: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
}

const item: CSSProperties = {
  padding: '14px 0',
  borderBottom: '1px solid var(--hair)',
}

const lastItem: CSSProperties = {
  padding: '14px 0',
}

const thumb: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  flexShrink: 0,
}

const when: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text)',
}

const untracked: CSSProperties = {
  marginTop: 16,
  padding: '12px 14px',
  border: '1px dashed var(--border)',
  borderRadius: 14,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--muted)',
}

const untrackedWhy: CSSProperties = {
  fontWeight: 400,
}

const pagingError: CSSProperties = {
  marginTop: 14,
  fontSize: 13,
  color: 'var(--clay)',
}

const retryInline: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'underline',
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
