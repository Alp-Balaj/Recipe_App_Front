import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { renderRoute } from '@/test/utils'
import { ApiError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import * as cookedApi from '@/api/cooked'
import * as cookLogApi from '@/api/cookLog'
import type { CookedDish, CookedDishDetail } from '@/api/cooked'
import type { CookLogEntry } from '@/api/cookLog'
import { requiresAuth } from '@/auth/AuthGateContext'

const RECIPE_ID = 'r-pide'

type DetailOverrides = Partial<Omit<CookedDishDetail, 'dish'>> & { dish?: Partial<CookedDish> }

function detail(overrides: DetailOverrides = {}): CookedDishDetail {
  const { dish: dishOverrides, ...rest } = overrides
  return {
    untrackedCooks: 0,
    ...rest,
    // Merged LAST and on its own, so a caller can override one field of the
    // dish without restating all nine. Spreading `overrides` after `dish` — the
    // obvious shape — makes this inner merge unreachable.
    dish: {
      recipeId: RECIPE_ID,
      title: 'Pide with minced lamb',
      imageUrl: null,
      timesCooked: 2,
      lastCookedAt: '2026-08-07T19:00:00.000Z',
      rating: null,
      latestNote: null,
      latestNoteCookedAt: null,
      recipeAvailable: true,
      ...dishOverrides,
    },
  }
}

function cook(overrides: Partial<CookLogEntry> = {}): CookLogEntry {
  return {
    id: 'c-1',
    recipeId: RECIPE_ID,
    recipeTitle: 'Pide with minced lamb',
    recipeImageUrl: null,
    mealPlanEntryId: null,
    cookedAt: '2026-08-07T19:00:00.000Z',
    note: null,
    recipeAvailable: true,
    ...overrides,
  }
}

/** Both of the page's reads, stubbed. Returns the cook-log spy for assertions. */
function stub(
  opts: {
    dish?: CookedDishDetail
    cooks?: CookLogEntry[]
    nextCursor?: string | null
  } = {},
) {
  vi.spyOn(cookedApi, 'getCookedDish').mockResolvedValue(opts.dish ?? detail())
  return vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({
    items: opts.cooks ?? [cook()],
    nextCursor: opts.nextCursor ?? null,
  })
}

describe('/cooked/:recipeId', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists that dish’s cooks, newest first', async () => {
    const getCookLog = stub({
      cooks: [
        cook({ id: 'c-2', cookedAt: '2026-08-07T19:00:00.000Z' }),
        cook({ id: 'c-1', cookedAt: '2026-06-02T19:00:00.000Z' }),
      ],
    })

    renderRoute(`/cooked/${RECIPE_ID}`)

    expect(await screen.findByRole('heading', { name: 'Pide with minced lamb' })).toBeInTheDocument()

    // The read is the cook log NARROWED to this dish (design D9) — not the whole
    // log filtered client-side, which would page through everything the user
    // ever cooked to find two rows.
    expect(getCookLog).toHaveBeenCalledWith(expect.objectContaining({ recipeId: RECIPE_ID }))

    // Newest first: the page reads top-down as "the last time I made this, and
    // the time before that".
    const cooks = screen.getAllByRole('listitem')
    expect(cooks).toHaveLength(2)
    expect(cooks[0]).toHaveTextContent(/August/)
    expect(cooks[1]).toHaveTextContent(/June/)
  })

  it('shows each cook’s own note', async () => {
    stub({
      cooks: [
        cook({ id: 'c-2', cookedAt: '2026-08-07T19:00:00.000Z', note: 'less water next time' }),
        cook({ id: 'c-1', cookedAt: '2026-06-02T19:00:00.000Z', note: null }),
      ],
    })

    renderRoute(`/cooked/${RECIPE_ID}`)

    const cooks = await screen.findAllByRole('listitem')

    // A note belongs to ONE cook (design D4). The annotated cook shows its text;
    // the one with no note must not borrow it — that is the whole reason this
    // page exists rather than the dish row's single latest note.
    expect(cooks[0]).toHaveTextContent('less water next time')
    expect(cooks[1]).not.toHaveTextContent('less water next time')
  })

  it('adds a note to a cook that never had one', async () => {
    stub({ cooks: [cook({ id: 'c-1', note: null })] })
    const updateCookNote = vi
      .spyOn(cookLogApi, 'updateCookNote')
      .mockResolvedValue(cook({ id: 'c-1', note: 'the morning-after thought' }))

    renderRoute(`/cooked/${RECIPE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Add a note' }))
    await userEvent.type(
      screen.getByRole('textbox', { name: /note about this cook/i }),
      'the morning-after thought',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // D10, and the reason for the whole ticket: before this, the only place a
    // note could be written was the rate-your-last-cook card, and only for the
    // most recent cook — so every older cook was unreachable and unannotatable
    // anywhere in the app.
    expect(updateCookNote).toHaveBeenCalledWith('c-1', 'the morning-after thought')
  })

  it('edits a note that already exists', async () => {
    stub({ cooks: [cook({ id: 'c-1', note: 'first thoughts' })] })
    const updateCookNote = vi
      .spyOn(cookLogApi, 'updateCookNote')
      .mockResolvedValue(cook({ id: 'c-1', note: 'second thoughts' }))

    renderRoute(`/cooked/${RECIPE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit note' }))
    const field = screen.getByRole('textbox', { name: /note about this cook/i })
    await userEvent.clear(field)
    await userEvent.type(field, 'second thoughts')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateCookNote).toHaveBeenCalledWith('c-1', 'second thoughts')
  })

  it('clears a note back to empty by sending null, not a blank string', async () => {
    stub({ cooks: [cook({ id: 'c-1', note: 'never mind' })] })
    const updateCookNote = vi
      .spyOn(cookLogApi, 'updateCookNote')
      .mockResolvedValue(cook({ id: 'c-1', note: null }))

    renderRoute(`/cooked/${RECIPE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit note' }))
    await userEvent.clear(screen.getByRole('textbox', { name: /note about this cook/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // "Cleared" has ONE representation. The server normalises blank to null on
    // the way in so a written-then-cleared note falls back to the one before it
    // on the dish row; sending '' would rely on that normalisation instead of
    // stating the intent.
    expect(updateCookNote).toHaveBeenCalledWith('c-1', null)
  })

  it('stops the note at the length the server accepts', async () => {
    stub({ cooks: [cook({ id: 'c-1', note: null })] })

    renderRoute(`/cooked/${RECIPE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Add a note' }))

    // CookLog.Note is HasMaxLength(500) and the validator enforces it, so a
    // longer note is a 400 the user only discovers after typing it. Enforced
    // here instead, at the same number.
    expect(screen.getByRole('textbox', { name: /note about this cook/i })).toHaveAttribute(
      'maxlength',
      '500',
    )
  })

  it('says how many cooks predate the log, and invents no rows for them', async () => {
    stub({
      dish: detail({ dish: { timesCooked: 5 }, untrackedCooks: 4 }),
      cooks: [cook({ id: 'c-1' })],
    })

    renderRoute(`/cooked/${RECIPE_ID}`)

    // D12 — an honest count. The cook log is the complete record of every cook
    // it HAS, and backfilling four synthetic rows would put fabricated events in
    // a record whose entire value is that it holds only real ones.
    expect(await screen.findByText(/4 cooks before notes existed/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('says nothing about untracked cooks when there are none', async () => {
    stub({ dish: detail({ untrackedCooks: 0 }) })

    renderRoute(`/cooked/${RECIPE_ID}`)

    await screen.findByRole('heading', { name: 'Pide with minced lamb' })
    expect(screen.queryByText(/before notes existed/)).not.toBeInTheDocument()
  })

  it('keeps an unavailable dish’s notes readable and editable, and links nowhere', async () => {
    stub({
      dish: detail({ dish: { recipeAvailable: false }, untrackedCooks: 0 }),
      cooks: [cook({ id: 'c-1', note: 'worth repeating', recipeAvailable: false })],
    })
    const updateCookNote = vi
      .spyOn(cookLogApi, 'updateCookNote')
      .mockResolvedValue(cook({ id: 'c-1', note: 'still worth it', recipeAvailable: false }))

    renderRoute(`/cooked/${RECIPE_ID}`)

    expect(await screen.findByText('worth repeating')).toBeInTheDocument()
    expect(screen.getByText('unavailable')).toBeInTheDocument()

    // ADR-0001 — withdrawal takes the AUTHOR's content, never the reader's
    // record. Nothing links OUT to the recipe (the affordances that need it are
    // gone), but the record itself stays whole and annotatable.
    expect(screen.queryByRole('link', { name: /open the recipe/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    await userEvent.clear(screen.getByRole('textbox', { name: /note about this cook/i }))
    await userEvent.type(screen.getByRole('textbox', { name: /note about this cook/i }), 'still worth it')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateCookNote).toHaveBeenCalledWith('c-1', 'still worth it')
  })

  it('never names why a recipe went away', async () => {
    stub({
      dish: detail({ dish: { recipeAvailable: false } }),
      cooks: [cook({ recipeAvailable: false })],
    })

    renderRoute(`/cooked/${RECIPE_ID}`)

    await screen.findByRole('heading', { name: 'Pide with minced lamb' })

    // Unavailable is ONE state (design D14) and the server sends one flag for
    // both causes on purpose. Copy that picks one either guesses or, when it
    // guesses right, reports an author's private visibility decision.
    expect(screen.queryByText(/deleted|removed|private|hidden|unshared/i)).not.toBeInTheDocument()
  })

  it('offers the recipe when it is still open to you', async () => {
    stub()

    renderRoute(`/cooked/${RECIPE_ID}`)

    expect(await screen.findByRole('link', { name: /open the recipe/i })).toHaveAttribute(
      'href',
      `/recipes/${RECIPE_ID}`,
    )
  })

  it('pages older cooks on an explicit control', async () => {
    vi.spyOn(cookedApi, 'getCookedDish').mockResolvedValue(detail())
    const getCookLog = vi
      .spyOn(cookLogApi, 'getCookLog')
      .mockResolvedValueOnce({ items: [cook({ id: 'c-2' })], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({
        items: [cook({ id: 'c-1', cookedAt: '2026-06-02T19:00:00.000Z' })],
        nextCursor: null,
      })

    renderRoute(`/cooked/${RECIPE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Show older cooks' }))

    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
    // The cursor rides WITH the filter — dropping recipeId on page two would
    // silently widen the list to every dish the user has ever cooked.
    expect(getCookLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', recipeId: RECIPE_ID }),
    )
  })

  it('says so when the dish has no logged cooks at all', async () => {
    stub({
      dish: detail({ dish: { timesCooked: 3 }, untrackedCooks: 3 }),
      cooks: [],
    })

    renderRoute(`/cooked/${RECIPE_ID}`)

    // The legacy case in full: an aggregate with no rows behind it. The count
    // line is the only true thing there is to say, and it must not read as an
    // empty collection.
    expect(await screen.findByText(/3 cooks before notes existed/)).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('never calls a failed cook-log read an empty record', async () => {
    vi.spyOn(cookedApi, 'getCookedDish').mockResolvedValue(detail({ untrackedCooks: 0 }))
    vi.spyOn(cookLogApi, 'getCookLog').mockRejectedValue(new Error('network'))

    renderRoute(`/cooked/${RECIPE_ID}`)

    // The header loads and the cooks do not. Reporting "No cooks recorded" here
    // states that the user's notes do not exist because a request failed — the
    // one lie a page about keeping notes cannot afford, and it leaves them no
    // retry either.
    expect(await screen.findByText("Couldn't load this dish's cooks")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('No cooks recorded')).not.toBeInTheDocument()
  })

  it('sends a reader back to the list when the dish is not in Cooked', async () => {
    const notFound = new ApiError(404, 'Not Found')
    vi.spyOn(cookedApi, 'getCookedDish').mockRejectedValue(notFound)
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({ items: [], nextCursor: null })

    renderRoute(`/cooked/${RECIPE_ID}`)

    // A 404 is a definite answer — the server 404s exactly the dishes /cooked
    // refuses to list. "Check your connection and try again" would send this
    // reader to retry something that can never succeed.
    expect(await screen.findByText("This dish isn't in your Cooked list")).toBeInTheDocument()
    expect(screen.queryByText('Couldn’t load this dish')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('refreshes the dish list after a note is cleared, so its row can fall back', async () => {
    stub({ cooks: [cook({ id: 'c-1', note: 'never mind' })] })
    vi.spyOn(cookLogApi, 'updateCookNote').mockResolvedValue(cook({ id: 'c-1', note: null }))
    const getCookedDishes = vi
      .spyOn(cookedApi, 'getCookedDishes')
      .mockResolvedValue({ items: [], nextCursor: null })

    // The client half of "the dish row falls back to the next non-empty note".
    // The server picks the fallback (its subqueries filter `Note != null`), but
    // the row only shows it if this write invalidates the cache the row reads
    // from. Production staleTime is 30s, so without the invalidation a reader
    // going back to /cooked sees the note they just deleted still quoted.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await client.fetchInfiniteQuery({
      queryKey: queryKeys.cooked.list(),
      queryFn: () => cookedApi.getCookedDishes({}),
      initialPageParam: undefined as string | undefined,
    })
    expect(getCookedDishes).toHaveBeenCalledTimes(1)
    expect(client.getQueryState(queryKeys.cooked.list())?.isInvalidated).toBe(false)

    renderRoute(`/cooked/${RECIPE_ID}`, { client })

    await userEvent.click(await screen.findByRole('button', { name: 'Edit note' }))
    await userEvent.clear(screen.getByRole('textbox', { name: /note about this cook/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Marked stale, not refetched: nothing is observing the list while the dish
    // page is on screen, so react-query refetches it on the reader's next visit
    // rather than in the background. That is the invalidation doing its job —
    // asserting a refetch here would assert a behaviour react-query does not
    // have and would pass only by accident.
    await waitFor(() =>
      expect(client.getQueryState(queryKeys.cooked.list())?.isInvalidated).toBe(true),
    )
  })

  it('offers a retry when the dish cannot be loaded', async () => {
    vi.spyOn(cookedApi, 'getCookedDish').mockRejectedValue(new Error('network'))
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({ items: [], nextCursor: null })

    renderRoute(`/cooked/${RECIPE_ID}`)

    expect(await screen.findByText("Couldn't load this dish")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('reports a failed save without claiming it landed', async () => {
    stub({ cooks: [cook({ id: 'c-1', note: null })] })
    vi.spyOn(cookLogApi, 'updateCookNote').mockRejectedValue(new Error('network'))

    renderRoute(`/cooked/${RECIPE_ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Add a note' }))
    await userEvent.type(screen.getByRole('textbox', { name: /note about this cook/i }), 'lost?')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // The text the user typed must still be on screen and still editable. A
    // silent failure that closed the editor would lose the note and tell them
    // nothing — the one thing a page about keeping notes must not do.
    const editor = await screen.findByRole('alert')
    expect(editor).toHaveTextContent(/Couldn’t save that/)
    expect(screen.getByRole('textbox', { name: /note about this cook/i })).toHaveValue('lost?')
  })

  it('is an account-only route, so a guest is asked to sign in', () => {
    // Same reason as /cooked itself: both endpoints behind this page are
    // caller-scoped and answer 401, so without this a guest deep-linking a dish
    // gets a broken page instead of the login modal.
    expect(requiresAuth(`/cooked/${RECIPE_ID}`)).toBe(true)
  })
})

// The dish row's link is asserted in CookedPage.test.tsx, where the list lives —
// both for an available dish and for an unavailable one. Not repeated here.
