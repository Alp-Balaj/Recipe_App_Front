// ─────────────────────────────────────────────────────────────────────────
// /cooked — the dishes you have actually made (KAN-4, design D2), and since
// KAN-9 the LAYOUT for /cooked/:recipeId as well.
//
// Its unit is the DISH, not the cook: a recipe cooked four times is one row.
// That is the whole difference from /plan/cooks, which is the same cooking in
// time order and stays. This page answers "which of these turned out well, and
// what did I say about it last time"; that one answers "what did I cook on
// Friday".
//
// Private, always — Cooked is the user's own record and has no viewer-facing
// variant. /cooked is therefore in requiresAuth(), so a guest deep-linking it
// gets the login modal rather than the "couldn't load" state /plan/cooks shows.
//
// The list, its states and its "Show older dishes" control live in
// CookedDishList, which the Profile tab renders too.
//
// "Add a cook" (KAN-6) lives HERE and not in CookedDishList, even though the
// Profile tab renders that list too. Cooked is the page you open to look after
// your record; the Profile tab is a summary of it. Putting a write control on
// both would be two entry points to maintain for one gesture, and the summary is
// not where anyone goes to do bookkeeping.
//
// ── Two panes, one surface (KAN-9) ───────────────────────────────────────
//
// Cooked is written for a phone first: the moment a user wants it, they are
// standing over a pan. On a wide window it becomes a tool instead — the dish
// list on one side, the selected dish's cooks and notes on the other, with no
// navigation between them.
//
// This file is a LAYOUT ROUTE, and /cooked/:recipeId is its child. That is what
// makes the two shapes one surface rather than two implementations:
//
//   wide   — the list stays mounted and the child renders in the pane beside it
//   narrow — the child renders ALONE, byte for byte the screen KAN-5 shipped
//
// Selection is the URL either way, so the wide view is shareable and survives a
// refresh, and the phone's back gesture still returns to the list.
//
// The list being MOUNTED (not re-created per selection) is the load-bearing
// part, and it is why this is a layout route rather than each page composing
// its own copy of the other. The search box below is plain component state:
// with two sibling routes, selecting a dish would remount this component and
// silently throw away what the reader had typed, mid-hunt, on every click.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, Outlet, useMatch, useNavigate } from 'react-router-dom'
import AddCookPanel from '@/components/cooked/AddCookPanel'
import CookedDishList from '@/components/cooked/CookedDishList'
import { COOKED_LIST_PANE, COOKED_TWO_PANE } from '@/components/cooked/cookedLayout'
import StateBlock from '@/components/ui/StateBlock'
import { useMediaQuery } from '@/hooks/useMediaQuery'

export default function CookedPage() {
  const navigate = useNavigate()
  const twoPane = useMediaQuery(COOKED_TWO_PANE)
  // The child route's param. Read with useMatch rather than useParams, which in
  // a layout reports the LAYOUT's own params and never sees :recipeId.
  const selectedId = useMatch('/cooked/:recipeId')?.params.recipeId ?? null

  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState<string | null>(null)

  // `term` is what is in the box; `q` is what has been asked of the server. The
  // same split, and the same 300ms, as the follow lists' search: a request per
  // keystroke against a keyset-paged endpoint is four round trips to type
  // "stew", three of which are already stale when they land.
  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQ(term.trim()), 300)
    return () => clearTimeout(timer)
  }, [term])

  // "Clearing search restores the full list AT THE TOP." Changing `q` gives a
  // fresh query — a different cache key, paged from the beginning — but the
  // reader is still scrolled to wherever the previous results ended, which on a
  // shorter list is past the end of the new one. Reset the scroller itself, in
  // whichever shape it currently is.
  //
  // scrollTop, not scrollTo: the repo's existing idiom for driving a scroll
  // container it owns (ChatPage, the shopping list's aisle jump), and the one
  // jsdom implements — scrollTo is missing there, so the alternative throws in
  // every test that renders this page rather than in none of them.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [q])

  const header = (
    <header style={{ marginBottom: 18 }}>
      <Link to="/plan" style={back}>
        ‹ Plan
      </Link>
      <div style={titleRow}>
        <h1 style={title}>Cooked</h1>
        <button type="button" style={addButton} onClick={() => setAdding(true)}>
          Add a cook
        </button>
      </div>
      <div style={subtitle}>
        Everything you have made, most recently cooked first. Ratings and notes are yours alone.
      </div>
      {/* The reason Cooked needs no alphabetical sort (design D13): a collection
          longer than a screen is navigated by naming what you want, not by
          re-ordering everything to hunt for it. */}
      <div style={searchRow}>
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search your dishes"
          aria-label="Search your dishes"
          style={search}
        />
        {/* Our own clear button, not type="search"'s native one: Firefox draws
            no clear affordance at all, and the browsers that do only draw it
            while the box has focus. Without this the only way out of a search
            WITH results on screen is to select the text and delete it — the
            empty-results state's "Clear search" never appears, because there
            are results. */}
        {term && (
          <button type="button" onClick={() => setTerm('')} style={clear} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>
    </header>
  )

  const list = (
    <>
      {header}

      {/* A backdated cook usually lands somewhere down the list rather than at
          the top — that is the feature working, and it is also why it needs
          saying out loud. Without this the user records a two-year-old cook,
          sees an unchanged first screen, and concludes nothing happened. */}
      {added && (
        <div role="status" style={confirmation}>
          Added a cook of <strong>{added}</strong>.
        </div>
      )}

      <CookedDishList
        q={q}
        selectedId={twoPane ? selectedId : null}
        onClearSearch={() => setTerm('')}
        onBrowse={() => navigate('/discover')}
      />
    </>
  )

  const panel = adding && (
    <AddCookPanel onClose={() => setAdding(false)} onAdded={(dishTitle) => setAdded(dishTitle)} />
  )

  // Below the breakpoint the dish is its own SCREEN, so the layout gets out of
  // the way entirely — no list rendered, and therefore no request for one.
  // Anything less (rendering the list hidden, say) would fetch a page of dishes
  // nobody can see, on the connection least able to afford it.
  if (!twoPane) {
    if (selectedId) return <Outlet />

    return (
      <div className="scroll" style={page} ref={scroller}>
        <div style={canvas}>{list}</div>
        {panel}
      </div>
    )
  }

  return (
    <div style={twoPaneFrame}>
      <div className="scroll" style={listPane} ref={scroller}>
        {list}
      </div>

      {/* The dish pane. Its own scroller, not a column of one long page: the
          list can be forty dishes and the dish forty cooks, and scrolling one
          to read the other is the failure mode a two-pane view exists to fix.
          `position: relative` is what the child's own absolute frame docks to. */}
      <div style={dishPane}>
        {selectedId ? (
          <Outlet />
        ) : (
          // Centred in the pane, unlike every other StateBlock in the app: those
          // sit at the top of a column of content that has simply run out, and
          // this one IS the pane. Left at the top it reads as a caption for a
          // dish that failed to load.
          <div style={emptyPane}>
            <StateBlock
              title="Pick a dish"
              body="Its cooks, and every note you left on them, open here beside the list."
            />
          </div>
        )}
      </div>

      {panel}
    </div>
  )
}

const page: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '54px 18px 24px',
}

const twoPaneFrame: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 0px)',
  display: 'flex',
  alignItems: 'stretch',
}

const listPane: CSSProperties = {
  flex: `0 0 ${COOKED_LIST_PANE}px`,
  maxWidth: COOKED_LIST_PANE,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '32px 20px 24px',
  borderRight: '1px solid var(--border)',
}

const dishPane: CSSProperties = {
  position: 'relative',
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
}

const emptyPane: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
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

const titleRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const addButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '7px 14px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--accent)',
}

const searchRow: CSSProperties = {
  position: 'relative',
  marginTop: 14,
}

const search: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--inputbg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  // Right padding leaves room for the clear button to sit inside the field.
  padding: '9px 34px 9px 12px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--text)',
}

const clear: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  width: 34,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  padding: 0,
  fontFamily: 'inherit',
  fontSize: 12,
  lineHeight: 1,
  color: 'var(--muted)',
}

const confirmation: CSSProperties = {
  marginBottom: 14,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--text)',
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
