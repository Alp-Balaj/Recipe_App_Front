// ─────────────────────────────────────────────────────────────────────────
// Cooked — the dish list itself (KAN-4).
//
// Its own component because two surfaces render exactly this: the /cooked page
// and the fourth Profile tab. One list, one set of states, so the two cannot
// drift into disagreeing about what an empty collection or an unavailable dish
// looks like.
//
// The row is the whole design. Each line answers one question a user opening
// Cooked actually has: what did I make, how often, how recently, was it any
// good, and what did I say about it last time. There are deliberately no
// statistics, no streaks and no sort control (design D13) — that is a different
// product, and this one is a record.
//
// Search (KAN-9) arrives as a prop, already debounced, and goes straight to the
// server. The list never filters `dishes` itself — see the `q` prop.
//
// Two rules the copy must keep:
//   - "Unavailable" is ONE state (design D14, ADR-0001). A recipe leaves reach
//     either because its author removed it or because they stopped sharing it,
//     and the server sends one flag for both, on purpose — naming the second
//     cause would report an author's private visibility decision to a stranger.
//     Say only that you cannot open it. /plan/cooks learned this the hard way.
//   - The note carries its OWN date, never the last-cooked one. A note belongs
//     to one cook, so pairing it with a different cook's date would quietly
//     turn "needs more chilli" into a claim about a meal it was never about.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { CookedDish } from '@/api/cooked'
// Shared with CookedDishPage (KAN-5): the dish page opens directly out of this
// row, so the same last-cooked date is on screen either side of one tap. Two
// copies of the formatter drifted into wording it two ways.
import { longDate, timesCooked } from '@/components/cooked/cookedFormats'
import StateBlock from '@/components/ui/StateBlock'
import { useCookedDishes } from '@/hooks/useCookedDishes'
import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'

interface Props {
  /** The empty state's call to action — where a user with no dishes should go. */
  onBrowse?: () => void
  /**
   * The search term, already debounced (KAN-9). Passed STRAIGHT to the server and
   * never applied to `dishes` here: the collection is keyset-paged, so a filter
   * over the pages in hand would report "no such dish" for anything the reader
   * has not paged to yet.
   */
  q?: string
  /**
   * The dish the pane beside this list is showing (KAN-9, two-pane only). Marks
   * the row so a reader scrolling the list can still see what they opened.
   */
  selectedId?: string | null
  /** The empty-SEARCH state's way out. Absent means this list has no search box. */
  onClearSearch?: () => void
}

export default function CookedDishList({ onBrowse, q = '', selectedId, onClearSearch }: Props) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCookedDishes(q)

  const dishes = (data?.pages ?? []).flatMap((page) => page.items)

  // A page can come back EMPTY and still carry a cursor: the server omits dishes
  // it cannot render (a pre-August one with neither a readable recipe nor a
  // snapshot title), and a whole page of those leaves nothing to show while more
  // dishes wait behind the cursor. Stopping there would tell a user with a full
  // collection that they have cooked nothing.
  //
  // So keep pulling until there is something to render or the cursor runs out.
  // This is NOT the infinite scroll D-decision rules out: that is about loading
  // past what the reader has already seen, whereas this is finishing the first
  // page. Once one row exists, paging is the explicit button below and nothing
  // fetches on its own. It terminates because each page advances the cursor.
  //
  // `!isError` is load-bearing, and the loop it prevents is easy to measure
  // wrongly. A failed continuation leaves dishes empty and hasNextPage set, so
  // the first two conditions stay true, while isFetchingNextPage flips
  // true → false on every failure — which changes the dep array and re-fires
  // this effect. Unguarded that is an unbounded request loop against an
  // authenticated endpoint (measured at ~20 calls in 1.5s with a 60ms-latency
  // rejection, doubled again by main.tsx's `retry: 1`), all of it behind an
  // error block the user is already looking at.
  //
  // A rejection with NO latency does not reproduce it — the loading render
  // collapses before the deps settle, so a probe built that way reports two
  // calls and clears a guard that is doing real work.
  const fillingFirstPage = dishes.length === 0 && hasNextPage && !isError
  useEffect(() => {
    if (fillingFirstPage && !isFetchingNextPage) void fetchNextPage()
  }, [fillingFirstPage, isFetchingNextPage, fetchNextPage])

  // An error with nothing to show yet takes the whole surface; an error with
  // rows already on screen does NOT — it renders inline BESIDE them, below.
  // /plan/cooks makes the same distinction on purpose: a blip while tapping
  // "Show older dishes" must not throw away the forty dishes the reader had
  // already loaded and scrolled through.
  if (isError && dishes.length === 0) {
    return (
      <StateBlock
        title="Couldn't load your dishes"
        body="Check your connection and try again."
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />
    )
  }
  if (isLoading || fillingFirstPage) {
    return <StateBlock title="Loading your dishes…" body="Fetching what you have cooked." />
  }
  // Two different facts, and only one of them is about the reader's cooking
  // (KAN-9). "Nothing cooked yet" is a claim about the COLLECTION, and telling
  // it to someone with forty dishes and a typo is false — worse, its call to
  // action sends them off to find a recipe when what they need is the box they
  // just typed into. So the search miss gets its own state, its own words, and
  // the one way out that fixes the actual problem.
  if (dishes.length === 0 && q) {
    return (
      <StateBlock
        title={`No dishes matching “${q}”`}
        body="Search looks at the name a dish is listed under. Try a shorter word."
        action={onClearSearch ? { label: 'Clear search', onClick: onClearSearch } : undefined}
      />
    )
  }
  if (dishes.length === 0) {
    return (
      <StateBlock
        title="Nothing cooked yet"
        body="Finish a recipe and it lands here — with how often you have made it and what you thought."
        action={onBrowse ? { label: 'Find something to cook', onClick: onBrowse } : undefined}
      />
    )
  }

  return (
    <>
      {dishes.map((dish, index) => (
        <DishRow
          key={dish.recipeId}
          dish={dish}
          last={index === dishes.length - 1}
          selected={dish.recipeId === selectedId}
        />
      ))}

      {/* The failed-while-paging case: the rows above survive, and the retry
          sits with the control that failed rather than replacing the list. */}
      {isError && (
        <div role="alert" style={pagingError}>
          Couldn&rsquo;t load older dishes.{' '}
          <button type="button" onClick={() => void fetchNextPage()} style={retryInline}>
            Try again
          </button>
        </div>
      )}

      {/* An explicit control, not infinite scroll: this is a record you scan
          deliberately, and a list that grows under your thumb makes "how far
          back does this go" unanswerable. */}
      {hasNextPage && !isError && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          style={more}
        >
          {isFetchingNextPage ? 'Loading…' : 'Show older dishes'}
        </button>
      )}
    </>
  )
}

function DishRow({
  dish,
  last,
  selected,
}: {
  dish: CookedDish
  last: boolean
  selected: boolean
}) {
  const image = dish.imageUrl

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
            : { backgroundImage: gradientFor(dish.recipeId || dish.title) }),
        }}
        role="presentation"
      />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={dishTitle}>{dish.title}</span>
          {dish.rating != null && <Stars rating={dish.rating} />}
        </div>
        <span style={when}>
          {timesCooked(dish.timesCooked)} · last {longDate(dish.lastCookedAt)}
        </span>
        {dish.latestNote && (
          <span style={note}>
            &ldquo;{dish.latestNote}&rdquo;
            {dish.latestNoteCookedAt && <span style={noteDate}> — {longDate(dish.latestNoteCookedAt)}</span>}
          </span>
        )}
      </div>
      {!dish.recipeAvailable && <span style={gone}>unavailable</span>}
    </>
  )

  const style: CSSProperties = {
    ...rowStyle,
    ...(last ? null : { borderBottom: '1px solid var(--hair)' }),
    // Two-pane only, and never on a phone, where nothing is ever "selected":
    // `selectedId` is only passed by the surface that renders a dish beside the
    // list. Padded out into the pane's own gutter so the tint reads as a band
    // across the row rather than a box drawn around the text.
    ...(selected
      ? { background: 'var(--chipbg)', margin: '0 -10px', padding: '12px 10px', borderRadius: 12 }
      : null),
  }

  // The row opens the DISH page, not the recipe (KAN-5) — every time the user
  // made it, and every note they left. The recipe is one link further in, on
  // that page, where it can be withheld on its own terms.
  //
  // An unavailable dish links here TOO, which is the change from KAN-4's
  // recipe-or-nothing rule. Its notes are exactly the ones this ticket exists to
  // make editable and they live nowhere else, so leaving the row inert would
  // strand the record it is a row of. Nothing about the destination needs the
  // recipe: the page is the caller's own log.
  // On a wide window this same link becomes the two-pane selection (KAN-9) — it
  // still changes the URL, so the pane is shareable and survives a refresh, and
  // the layout above simply keeps the list mounted beside it instead of
  // navigating away. One row, one destination, either shape.
  return (
    <Link
      to={`/cooked/${dish.recipeId}`}
      aria-current={selected ? 'page' : undefined}
      style={{ ...style, textDecoration: 'none' }}
    >
      {body}
    </Link>
  )
}

/** Read-only, and small: the row reports a rating, it does not collect one. */
function Stars({ rating }: { rating: number }) {
  return (
    <span style={stars} aria-label={`Rated ${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} style={{ color: star <= rating ? 'var(--tagcol)' : 'var(--navidle)' }}>
          ★
        </span>
      ))}
    </span>
  )
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

const dishTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'var(--text)',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const stars: CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.5,
  flexShrink: 0,
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

const noteDate: CSSProperties = {
  fontStyle: 'italic',
  fontSize: 12,
}

const gone: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--clay)',
  flexShrink: 0,
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
