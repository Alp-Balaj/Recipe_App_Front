import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as cookedApi from '@/api/cooked'
import * as cookLogApi from '@/api/cookLog'
import type { CookedDish, CookedDishDetail } from '@/api/cooked'
import { requiresAuth } from '@/auth/AuthGateContext'

function dish(overrides: Partial<CookedDish> = {}): CookedDish {
  return {
    recipeId: 'r-pide',
    title: 'Pide with minced lamb',
    imageUrl: null,
    timesCooked: 1,
    lastCookedAt: '2026-08-07T19:00:00.000Z',
    rating: null,
    latestNote: null,
    latestNoteCookedAt: null,
    recipeAvailable: true,
    ...overrides,
  }
}

describe('/cooked', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows a dish once, with how many times it was cooked', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish({ timesCooked: 4 })],
      nextCursor: null,
    })

    renderRoute('/cooked')

    // The unit is the DISH (design D1). Four cooks are one row carrying the
    // count, which is the entire difference from /plan/cooks.
    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByText(/Cooked 4 times/)).toBeInTheDocument()
  })

  it('dates the latest note against its own cook, not the last one', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [
        dish({
          timesCooked: 2,
          lastCookedAt: '2026-08-07T19:00:00.000Z',
          latestNote: 'needs more chilli',
          // Deliberately a different MONTH from lastCookedAt, so the assertions
          // below hold whatever order the runner's locale puts day and month in.
          latestNoteCookedAt: '2026-06-02T19:00:00.000Z',
        }),
      ],
      nextCursor: null,
    })

    renderRoute('/cooked')

    // D4 — a note belongs to ONE cook. Rendering it beside the last-cooked date
    // would turn "needs more chilli" into a claim about a meal it was never
    // about, which is exactly why the server sends the note's own date.
    const note = await screen.findByText(/needs more chilli/)
    expect(note).toHaveTextContent(/June/)
    expect(note).not.toHaveTextContent(/August/)
    expect(screen.getByText(/^Cooked twice · last /)).toHaveTextContent(/August/)
  })

  it('keeps an unavailable dish readable, and still reachable', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish({ recipeAvailable: false })],
      nextCursor: null,
    })

    renderRoute('/cooked')

    // ADR-0001: withdrawing the recipe withdraws the AUTHOR's content, never the
    // reader's record. The dish stays, titled from the cook's snapshot.
    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByText('unavailable')).toBeInTheDocument()

    // KAN-5 changed where the row points. Under KAN-4 an unavailable dish was
    // deliberately inert, because the only destination was the recipe. Now the
    // destination is the dish's OWN page — the caller's log, which needs no
    // recipe — and leaving this row inert would strand the notes this ticket
    // exists to make editable. Still no link to /recipes: that is what
    // `recipeAvailable: false` withholds.
    expect(await screen.findByRole('link', { name: /Pide/ })).toHaveAttribute(
      'href',
      '/cooked/r-pide',
    )
  })

  it('never names why a recipe went away', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish({ recipeAvailable: false })],
      nextCursor: null,
    })

    renderRoute('/cooked')

    await screen.findByText('Pide with minced lamb')

    // Unavailable is ONE state (design D14) and the server sends one flag for
    // both causes on purpose. Copy that picks one is either a guess or, when it
    // guesses right, reports an author's private visibility decision to a
    // stranger — the leak ADR-0001 names.
    expect(screen.queryByText(/deleted|removed|private|hidden|unshared/i)).not.toBeInTheDocument()
  })

  it('opens the dish page, not the recipe', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish()],
      nextCursor: null,
    })

    renderRoute('/cooked')

    // KAN-5: tapping a dish opens every time the user made it, with the notes
    // they left. The recipe is one link further in, on that page.
    expect(await screen.findByRole('link', { name: /Pide/ })).toHaveAttribute(
      'href',
      '/cooked/r-pide',
    )
  })

  it('pages through older dishes on an explicit control', async () => {
    const getCookedDishes = vi
      .spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [dish()], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({
        items: [dish({ recipeId: 'r-stew', title: 'Beef stew' })],
        nextCursor: null,
      })

    renderRoute('/cooked')

    await userEvent.click(await screen.findByRole('button', { name: 'Show older dishes' }))

    expect(await screen.findByText('Beef stew')).toBeInTheDocument()
    expect(getCookedDishes).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
    )
  })

  it('does not stop at an empty page that still carries a cursor', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({ items: [dish()], nextCursor: null })

    renderRoute('/cooked')

    // The server omits dishes it cannot render (a pre-August one with neither a
    // readable recipe nor a snapshot title), so a whole page can come back empty
    // with more behind the cursor. Reporting "Nothing cooked yet" there would
    // tell a user with a full collection that they have cooked nothing — so the
    // list finishes the first page itself, with no click.
    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.queryByText('Nothing cooked yet')).not.toBeInTheDocument()
  })

  it('stops — and stays stopped — when filling that first page fails', async () => {
    const getCookedDishes = vi
      .spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [], nextCursor: 'cursor-2' })
      // The LATENCY is the test. A rejection that settles synchronously
      // collapses the loading render before the effect's deps change, so the
      // auto-continue never re-fires and an unguarded loop looks fine. With a
      // real round-trip's delay, isFetchingNextPage flips true → false on every
      // failure, the deps change, and the effect hammers the endpoint forever
      // behind an error block the user is already looking at.
      .mockImplementation(
        () =>
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('network')), 30)),
      )

    renderRoute('/cooked')

    expect(await screen.findByText("Couldn't load your dishes")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 500))

    // One first page + one failed continuation. Anything climbing past that is
    // the loop.
    expect(getCookedDishes.mock.calls.length).toBeLessThanOrEqual(3)
  })

  it('keeps the dishes already loaded when paging fails', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [dish()], nextCursor: 'cursor-2' })
      .mockRejectedValue(new Error('network'))

    renderRoute('/cooked')

    await userEvent.click(await screen.findByRole('button', { name: 'Show older dishes' }))

    // A blip while paging must not throw away what the reader already has. The
    // error belongs beside the rows, with the retry on the control that failed —
    // /plan/cooks renders it inline for exactly this reason.
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn’t load older dishes/)
    expect(screen.getByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your dishes")).not.toBeInTheDocument()
  })

  it('says so when nothing has been cooked', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({ items: [], nextCursor: null })

    renderRoute('/cooked')

    expect(await screen.findByText('Nothing cooked yet')).toBeInTheDocument()
  })

  // --- search (KAN-9) ----------------------------------------------------

  it('asks the SERVER for matching dishes, and does not re-filter the answer', async () => {
    const getCookedDishes = vi
      .spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [dish()], nextCursor: null })
      .mockResolvedValue({
        // Deliberately does NOT contain "stew". The server matched it (a dish is
        // findable by the title it DISPLAYS, and this one has been renamed since
        // it was cooked), and the client's only job is to render what came back.
        items: [dish({ recipeId: 'r-sunday', title: 'Sunday roast' })],
        nextCursor: null,
      })

    renderRoute('/cooked')
    await screen.findByText('Pide with minced lamb')

    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'stew')

    // The whole reason search is a server parameter: the collection is
    // keyset-paged, so filtering the pages already in hand would answer "no such
    // dish" for anything past the first page — for a record, the one wrong
    // answer that matters.
    await waitFor(() =>
      expect(getCookedDishes).toHaveBeenCalledWith(expect.objectContaining({ q: 'stew' })),
    )
    expect(await screen.findByText('Sunday roast')).toBeInTheDocument()
    expect(screen.queryByText('Pide with minced lamb')).not.toBeInTheDocument()
  })

  it('keeps searching past the first page', async () => {
    const getCookedDishes = vi
      .spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [dish()], nextCursor: null })
      .mockResolvedValueOnce({ items: [dish({ title: 'Match one' })], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({
        items: [dish({ recipeId: 'r-two', title: 'Match two' })],
        nextCursor: null,
      })

    renderRoute('/cooked')
    await screen.findByText('Pide with minced lamb')
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'match')
    await screen.findByText('Match one')

    await userEvent.click(await screen.findByRole('button', { name: 'Show older dishes' }))

    // Search and the cursor compose server-side, so the second page has to carry
    // BOTH. Dropping the term here pages back into the unfiltered collection and
    // appends dishes that match nothing the reader typed.
    expect(await screen.findByText('Match two')).toBeInTheDocument()
    expect(getCookedDishes).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'match', cursor: 'cursor-2' }),
    )
  })

  it('tells an empty search apart from an empty collection', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValueOnce({ items: [dish()], nextCursor: null })
      .mockResolvedValue({ items: [], nextCursor: null })

    renderRoute('/cooked')
    await screen.findByText('Pide with minced lamb')
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'zzz')

    // Two different facts about the collection, and only one of them is about
    // the reader's cooking. "Nothing cooked yet" — with its go-and-find-a-recipe
    // call to action — told to someone with forty dishes and a typo is simply
    // false, and sends them away from the box they need to fix.
    expect(await screen.findByText(/No dishes matching/)).toBeInTheDocument()
    expect(screen.queryByText('Nothing cooked yet')).not.toBeInTheDocument()
  })

  it('restores the whole collection when the search is cleared', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockImplementation(({ q } = {}) =>
      Promise.resolve(
        q === 'zzz'
          ? { items: [], nextCursor: null }
          : { items: [dish()], nextCursor: null },
      ),
    )

    renderRoute('/cooked')
    await screen.findByText('Pide with minced lamb')
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'zzz')
    await screen.findByText(/No dishes matching/)

    // Two ways out are on screen here — the box's own button and the empty
    // state's — and this is the empty state's, which is the last in the DOM.
    const ways = screen.getAllByRole('button', { name: 'Clear search' })
    await userEvent.click(ways[ways.length - 1])

    // The empty state's own way out, and it has to empty the BOX as well as the
    // filter — clearing one and not the other leaves the reader looking at a
    // full list under a search term that no longer applies to it.
    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('')
  })

  it('can clear a search that DID match something', async () => {
    vi.spyOn(cookedApi, 'getCookedDishes').mockImplementation(({ q } = {}) =>
      Promise.resolve({
        items: q ? [dish({ recipeId: 'r-stew', title: 'Beef stew' })] : [dish()],
        nextCursor: null,
      }),
    )

    renderRoute('/cooked')
    await screen.findByText('Pide with minced lamb')
    await userEvent.type(screen.getByRole('searchbox', { name: /search/i }), 'stew')
    await screen.findByText('Beef stew')

    // The empty-results state's "Clear search" is unreachable here — there ARE
    // results. Leaving it as the only way out means a reader who found what
    // they wanted has to select the text and delete it to get back: `type=
    // "search"` draws no clear affordance at all in Firefox, and only draws one
    // while focused in the browsers that do.
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('')
  })

  it('is an account-only route, so a guest is asked to sign in', () => {
    // Without this, a guest deep-linking /cooked renders the page against a 401
    // and reads "Couldn't load your dishes" — a broken page rather than a sign-in
    // prompt. That is the bug /plan/cooks still has, and the one line in
    // requiresAuth() is the whole fix.
    expect(requiresAuth('/cooked')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Cooked on a wide window (KAN-9) — the dish list and the selected dish side
// by side, with no navigation between them.
//
// matchMedia note: setup.ts installs a GLOBAL stub (matches: false) only when
// jsdom has none of its own, so it is a plain assignment rather than a mock
// vitest can restore per test. Swapping window.matchMedia for the duration of
// a test and restoring it in afterEach is this repo's existing pattern
// (FollowListPage.test.tsx, ProfilePage.test.tsx).
// ─────────────────────────────────────────────────────────────────────────

const realMatchMedia = window.matchMedia

function setViewport(wide: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('1180') || query.includes('1024') ? wide : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia
}

function detail(overrides: Partial<CookedDish> = {}): CookedDishDetail {
  return { untrackedCooks: 0, dish: dish(overrides) }
}

describe('/cooked on a wide window', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => {
    window.matchMedia = realMatchMedia
  })

  /** The dish pane's two reads — the header and that dish's cooks. */
  function stubDish() {
    vi.spyOn(cookedApi, 'getCookedDish').mockResolvedValue(detail())
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({ items: [], nextCursor: null })
  }

  it('puts the dish beside the list, with no navigation between them', async () => {
    setViewport(true)
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish(), dish({ recipeId: 'r-stew', title: 'Beef stew' })],
      nextCursor: null,
    })
    stubDish()

    renderRoute('/cooked/r-pide')

    // Both panes at once: the title appears as the list's row AND as the dish
    // pane's heading. On a phone these are two screens and only one of them
    // exists at a time.
    await waitFor(() => expect(screen.getAllByText('Pide with minced lamb')).toHaveLength(2))
    expect(screen.getByText('Beef stew')).toBeInTheDocument()

    // "No navigation between them" is the acceptance criterion, and a back link
    // is navigation — it would take the reader away from a list they are already
    // looking at.
    expect(screen.queryByRole('link', { name: /‹ Cooked/ })).not.toBeInTheDocument()
  })

  it('marks which dish the list is showing', async () => {
    setViewport(true)
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish(), dish({ recipeId: 'r-stew', title: 'Beef stew' })],
      nextCursor: null,
    })
    stubDish()

    renderRoute('/cooked/r-pide')

    // With both panes on screen the list has to say which row the other pane is
    // about, or a reader who scrolls the list loses track of what they opened.
    expect(await screen.findByRole('link', { name: /Pide/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: /Beef stew/ })).not.toHaveAttribute('aria-current')
  })

  it('selecting a dish changes the URL, so the view is shareable', async () => {
    setViewport(true)
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish()],
      nextCursor: null,
    })
    stubDish()

    const router = renderRoute('/cooked')

    // Nothing selected yet — the pane says so rather than sitting blank.
    expect(await screen.findByText(/Pick a dish/)).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('link', { name: /Pide/ }))

    // The two-pane view and the phone's separate pages are the SAME surface, so
    // selection is a URL and not component state: this view survives a refresh
    // and can be sent to someone.
    await waitFor(() => expect(router.state.location.pathname).toBe('/cooked/r-pide'))
    await waitFor(() => expect(screen.getAllByText('Pide with minced lamb')).toHaveLength(2))
  })

  it('keeps the list — and what was typed into it — across a selection', async () => {
    setViewport(true)
    vi.spyOn(cookedApi, 'getCookedDishes').mockResolvedValue({
      items: [dish()],
      nextCursor: null,
    })
    stubDish()

    renderRoute('/cooked')
    await userEvent.type(await screen.findByRole('searchbox', { name: /search/i }), 'pide')
    await waitFor(() => expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('pide'))

    await userEvent.click(await screen.findByRole('link', { name: /Pide/ }))
    await waitFor(() => expect(screen.getAllByText('Pide with minced lamb')).toHaveLength(2))

    // The list is ONE mounted list either side of a selection — that is what
    // "no navigation between them" buys, and the search box is the visible
    // proof. Rendering the two-pane view out of two separate page components
    // would remount the list here and throw the reader's search away mid-hunt.
    expect(screen.getByRole('searchbox', { name: /search/i })).toHaveValue('pide')
  })

  it('leaves the phone alone: the dish is still its own screen', async () => {
    setViewport(false)
    // Stubbed even though nothing should call it: an unimplemented spy would
    // let a regression fall through to the real fetch and fail as a network
    // error somewhere else, instead of failing on the line below.
    const getCookedDishes = vi
      .spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValue({ items: [dish()], nextCursor: null })
    stubDish()

    renderRoute('/cooked/r-pide')

    // Below the breakpoint nothing about KAN-5 changes: one screen, a back link
    // to the list, and — the part a layout route could quietly get wrong — no
    // request for a list that is not on screen.
    expect(await screen.findByRole('link', { name: /‹ Cooked/ })).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(getCookedDishes).not.toHaveBeenCalled()
  })
})
