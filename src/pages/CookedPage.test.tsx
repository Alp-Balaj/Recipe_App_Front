import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as cookedApi from '@/api/cooked'
import type { CookedDish } from '@/api/cooked'
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

  it('is an account-only route, so a guest is asked to sign in', () => {
    // Without this, a guest deep-linking /cooked renders the page against a 401
    // and reads "Couldn't load your dishes" — a broken page rather than a sign-in
    // prompt. That is the bug /plan/cooks still has, and the one line in
    // requiresAuth() is the whole fix.
    expect(requiresAuth('/cooked')).toBe(true)
  })
})
