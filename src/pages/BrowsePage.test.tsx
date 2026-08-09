import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { RecipeResponse } from '@/api/types'

let idSeq = 0
function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  idSeq += 1
  return {
    id: `id-${idSeq}`,
    title: `Recipe ${idSeq}`,
    description: 'Tasty things.',
    prepTimeMinutes: 5,
    cookTimeMinutes: 10,
    totalTimeMinutes: 15,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: 'Italian',
    caloriesPerServing: 300,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [],
    steps: [],
    tags: ['Quick'],
    createdByUserId: 'someone',
    ...over,
  }
}

/** MSW GET /recipes that records the last request URL for assertions. */
function listHandler(handler: (url: URL) => Response) {
  return http.get('*/recipes', ({ request }) => handler(new URL(request.url)))
}

/**
 * Open the filter sheet. The Discover redesign moved every control except
 * search behind it, and the trigger's label carries the active count, so the
 * name is matched by prefix.
 */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Filters/ }))
  await screen.findByRole('dialog', { name: 'Filters' })
}

describe('BrowsePage', () => {
  it('leads with a cover story and files the rest into departments', async () => {
    server.use(
      listHandler(() =>
        HttpResponse.json({ items: [makeRecipe({ title: 'Miso ramen' }), makeRecipe({ title: 'Lentil soup' })], nextCursor: null }),
      ),
    )
    renderRoute('/discover')
    // The first result is the cover; the rest fill the numbered departments.
    expect(await screen.findByRole('link', { name: 'Cover story: Miso ramen' })).toBeInTheDocument()
    expect(screen.getByText('Lentil soup')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Trending' })).toBeInTheDocument()
    // The front page is finite on purpose — pagination belongs to the result list.
    expect(screen.queryByText('Load more')).not.toBeInTheDocument()
  })

  it('puts the scan entry point on the front page', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe()], nextCursor: null })))
    renderRoute('/discover')
    const band = await screen.findByRole('link', { name: /what's in your fridge/i })
    expect(band.getAttribute('href')).toBe('/scan')
  })

  it('walks pages via Load more without duplicates', async () => {
    server.use(
      listHandler((url) => {
        const cursor = url.searchParams.get('cursor')
        if (!cursor) {
          return HttpResponse.json({ items: [makeRecipe({ id: 'a', title: 'Page one recipe' })], nextCursor: 'CUR2' })
        }
        return HttpResponse.json({ items: [makeRecipe({ id: 'b', title: 'Page two recipe' })], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    // A search term swaps the front page for the flat, paginated result list.
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value: 'recipe' } })
    expect(await screen.findByText('Page one recipe')).toBeInTheDocument()

    await userEvent.click(await screen.findByText('Load more'))
    expect(await screen.findByText('Page two recipe')).toBeInTheDocument()
    // First page's recipe still present exactly once (no dupes).
    expect(screen.getAllByText('Page one recipe')).toHaveLength(1)
    expect(screen.getByText("That's everything.")).toBeInTheDocument()
  })

  it('sends difficulty + tag filters as query params and resets pagination on change', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [makeRecipe({ title: 'Filtered recipe' })], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    expect(await screen.findByRole('link', { name: /^Cover story/ })).toBeInTheDocument()

    // Difficulty chip → difficulty param. Choices inside the sheet are a DRAFT:
    // nothing reaches the wire until "Show results".
    await openFilters(user)
    await user.click(screen.getByRole('button', { name: 'Medium' }))
    expect(urls.some((u) => u.includes('difficulty=Medium'))).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(urls.some((u) => u.includes('difficulty=Medium'))).toBe(true))

    // Stream G: the tag filter is a chip set, not a text input, and the value it
    // sends is the vocabulary member VERBATIM. It used to be lowercased here to
    // agree with a case-sensitive backend comparison over free text; lowercasing
    // a RecipeTag would now break the match instead of fixing it.
    await openFilters(user)
    // Only the eight likeliest tags are shown up front; the rest are one tap away.
    await user.click(screen.getByRole('button', { name: /^\+ \d+ more$/ }))
    await user.click(screen.getByLabelText('Filter by tag Vegan'))
    await user.click(screen.getByRole('button', { name: 'Show results' }))
    await waitFor(() => expect(urls.some((u) => u.includes('tags=Vegan'))).toBe(true))

    // Every request starts a fresh page (no cursor carried across filter changes).
    expect(urls.every((u) => !u.includes('cursor='))).toBe(true)
  })

  // Measured in headless Chromium: a title that is one unbroken token laid out a
  // 548px box inside a ~305px card at 320/360/375/414px alike. The title is a
  // FLEX ITEM, so its width floors at min-content — unlike the description
  // beneath it, which is a block and merely clips. That difference is the whole
  // bug, and min-width:0 + overflow-wrap is what removes the floor.
  it('keeps an unbreakable title from setting the card width', async () => {
    const user = userEvent.setup()
    server.use(
      listHandler(() =>
        HttpResponse.json({
          items: [
            makeRecipe({ title: 'Grandmas_extra_special_sunday_pot_roast_with_root_vegetables' }),
          ],
          nextCursor: null,
        }),
      ),
    )
    renderRoute('/discover')
    expect(await screen.findByRole('link', { name: /^Cover story/ })).toBeInTheDocument()
    // The editorial front page renders no browse cards; a filter switches to
    // the flat list, which is where the browse variant lives.
    await openFilters(user)
    await user.click(screen.getByRole('button', { name: 'Medium' }))
    await user.click(screen.getByRole('button', { name: 'Show results' }))

    const title = await screen.findByTestId('recipe-card-title')
    expect(title).toHaveStyle({ overflowWrap: 'anywhere', minWidth: '0px' })
  })

  it('counts the active filters on the trigger', async () => {
    const user = userEvent.setup()
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe()], nextCursor: null })))
    renderRoute('/discover')

    // The count is the ONLY filter state shown outside the sheet — the chip row
    // that used to sit under the search field is gone.
    expect(await screen.findByRole('button', { name: 'Filters' })).toBeInTheDocument()

    await openFilters(user)
    await user.click(screen.getByRole('button', { name: 'Easy' }))
    await user.click(screen.getByRole('button', { name: /^\+ \d+ more$/ }))
    await user.click(screen.getByLabelText('Filter by tag Vegan'))
    await user.click(screen.getByRole('button', { name: 'Show results' }))

    expect(await screen.findByRole('button', { name: 'Filters (2)' })).toBeInTheDocument()
  })

  it('shows the empty state when no recipes match', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [], nextCursor: null })))
    renderRoute('/discover')
    expect(await screen.findByText('No recipes found')).toBeInTheDocument()
  })

  it('shows an error state with retry on failure', async () => {
    server.use(listHandler(() => new HttpResponse(null, { status: 500 })))
    renderRoute('/discover')
    expect(await screen.findByText("Couldn't load recipes", undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('navigates to the detail route when a card is tapped', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe({ id: 'go-here', title: 'Tap me' })], nextCursor: null })))
    const router = renderRoute('/discover')
    await userEvent.click(await screen.findByText('Tap me'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/go-here'))
  })

  // ── Accessibility (fe · consolidation) ────────────────────────────────────

  // The first result is the cover story, so these mount a throwaway ahead of
  // the recipe under test: what is being asserted is the editorial CARD's
  // keyboard behaviour, and the cover has its own (also keyboard-operable) root.
  it('activates a focused recipe card with the Enter key', async () => {
    server.use(
      listHandler(() =>
        HttpResponse.json({
          items: [makeRecipe({ id: 'cover', title: 'Cover' }), makeRecipe({ id: 'kbd-enter', title: 'Enter recipe' })],
          nextCursor: null,
        }),
      ),
    )
    const router = renderRoute('/discover')
    const card = await screen.findByRole('link', { name: 'Enter recipe' })
    card.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/kbd-enter'))
  })

  it('activates a focused recipe card with the Space key', async () => {
    server.use(
      listHandler(() =>
        HttpResponse.json({
          items: [makeRecipe({ id: 'cover', title: 'Cover' }), makeRecipe({ id: 'kbd-space', title: 'Space recipe' })],
          nextCursor: null,
        }),
      ),
    )
    const router = renderRoute('/discover')
    const card = await screen.findByRole('link', { name: 'Space recipe' })
    card.focus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/kbd-space'))
  })

  it('activates the cover story with the keyboard', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe({ id: 'cover-kbd', title: 'Cover recipe' })], nextCursor: null })))
    const router = renderRoute('/discover')
    const hero = await screen.findByRole('link', { name: 'Cover story: Cover recipe' })
    hero.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/cover-kbd'))
  })

  it('applies a difficulty filter when the chip is activated by keyboard', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [makeRecipe({ title: 'Kbd filtered' })], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    expect(await screen.findByText('Kbd filtered')).toBeInTheDocument()

    await openFilters(user)
    const chip = screen.getByRole('button', { name: 'Medium' })
    chip.focus()
    await user.keyboard('{Enter}')
    screen.getByRole('button', { name: 'Show results' }).focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(urls.some((u) => u.includes('difficulty=Medium'))).toBe(true))
  })
})

// ── Server-side search (open-loops slice 2) ──────────────────────────────────
// Search used to filter only the pages already loaded, so a match on page four
// did not exist until you paged that far. It now reaches the wire as ?search=.
//
// These run on REAL timers, unlike IngredientNameField's debounce tests. Those
// mount a bare component; these mount a route that loads over MSW first, and
// waitFor/findBy deadlock against fake timers (they poll on the very timers
// being faked). The debounce is 300ms and waitFor's default budget is 1000ms,
// so real timers cover it comfortably.
//
// Input still goes through fireEvent rather than user-event: typing char by
// char with user-event would await between keystrokes and defeat the point of
// the debounce assertions.
describe('BrowsePage search', () => {
  async function typeSearch(value: string) {
    fireEvent.change(screen.getByLabelText('Search recipes'), { target: { value } })
  }

  it('sends the term to the server as ?search=', async () => {
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [makeRecipe({ title: 'Miso ramen' })], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()

    await typeSearch('miso')

    await waitFor(() => expect(urls.some((u) => u.includes('search=miso'))).toBe(true))
    // A fresh key means a fresh first page — no cursor is carried across.
    expect(urls.every((u) => !u.includes('cursor='))).toBe(true)
  })

  it('debounces — typing does not fire a request per keystroke', async () => {
    let requests = 0
    server.use(
      listHandler(() => {
        requests += 1
        return HttpResponse.json({ items: [makeRecipe({ title: 'Debounced' })], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    expect(await screen.findByText('Debounced')).toBeInTheDocument()
    const initial = requests

    // Five keystrokes with no await between them — all inside one debounce window.
    const input = screen.getByLabelText('Search recipes')
    for (const value of ['l', 'la', 'las', 'lasa', 'lasag']) {
      fireEvent.change(input, { target: { value } })
    }

    await waitFor(() => expect(requests).toBe(initial + 1))
    // Settle well past the window and confirm no straggler requests followed.
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(requests).toBe(initial + 1)
  })

  it('does not send a blank term as a filter', async () => {
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [makeRecipe({ title: 'Unfiltered' })], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    expect(await screen.findByText('Unfiltered')).toBeInTheDocument()

    await typeSearch('   ')
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(urls.every((u) => !u.includes('search='))).toBe(true)
  })

  it('names the term in the empty state rather than blaming the filters', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [], nextCursor: null })))
    renderRoute('/discover')
    await screen.findByText('No recipes found')

    await typeSearch('kohlrabi')

    expect(
      await screen.findByText(/Nothing matches "kohlrabi" — searched titles, descriptions and ingredients\./),
    ).toBeInTheDocument()
  })

  it('clears the term along with the other filters from the empty state', async () => {
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    renderRoute('/discover')
    await screen.findByText('No recipes found')

    await typeSearch('ramen')
    await waitFor(() => expect(urls.some((u) => u.includes('search=ramen'))).toBe(true))

    // The redesign dropped the standalone "Clear filters" link — the sheet owns
    // "Clear all" and the search field clears itself. The one place a combined
    // reset still earns its keep is the dead end: nothing matched.
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByLabelText('Search recipes')).toHaveValue('')
    await waitFor(() => expect(urls[urls.length - 1]).not.toContain('search='))
  })

  it('returns to the front page when the term is emptied', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe({ title: 'Clearable' })], nextCursor: null })))
    renderRoute('/discover')
    expect(await screen.findByRole('link', { name: 'Cover story: Clearable' })).toBeInTheDocument()

    await typeSearch('ramen')
    // Searching swaps the magazine for results…
    await waitFor(() => expect(screen.queryByRole('link', { name: /^Cover story/ })).toBeNull())

    await typeSearch('')
    // …and emptying the field brings it back.
    expect(await screen.findByRole('link', { name: 'Cover story: Clearable' })).toBeInTheDocument()
  })
})

// ── Departments: the "All ›" drill-in, and the way back out ─────────────────
//
// Quick tonight's "All ›" used to write ['Quick'] into the user's own tag state.
// That swapped the front page for a filtered list with NO way back: the only
// exit was opening the Filters sheet and un-picking a chip the user had never
// picked. The view is now state of its own, so it can be undone.
describe('BrowsePage departments', () => {
  /** Five recipes: one cover, three for Trending, and a spare for Quick tonight. */
  function frontPageRecipes() {
    return [
      makeRecipe({ title: 'Cover dish' }),
      makeRecipe({ title: 'Trending one' }),
      makeRecipe({ title: 'Trending two' }),
      makeRecipe({ title: 'Trending three' }),
      makeRecipe({ title: 'Quick dish', totalTimeMinutes: 15 }),
    ]
  }

  /** The "All ›" link belonging to one department — three sections carry one. */
  function seeAllIn(title: string) {
    const section = screen.getByRole('heading', { name: title, level: 2 }).closest('section')
    if (!section) throw new Error(`No section around the "${title}" heading`)
    return within(section as HTMLElement).getByRole('button', { name: 'All ›' })
  }

  it('titles the Quick tonight view and offers a way back to the front page', async () => {
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: frontPageRecipes(), nextCursor: null })
      }),
    )
    renderRoute('/discover')
    expect(await screen.findByRole('link', { name: 'Cover story: Cover dish' })).toBeInTheDocument()

    await userEvent.click(seeAllIn('Quick tonight'))

    // The results are named, so it is obvious what you are looking at…
    expect(await screen.findByRole('heading', { name: 'Quick tonight', level: 1 })).toBeInTheDocument()
    await waitFor(() => expect(urls.some((u) => u.includes('tags=Quick'))).toBe(true))
    expect(screen.queryByRole('link', { name: /^Cover story/ })).toBeNull()

    // …and one control leaves, instead of a hunt through the Filters sheet.
    await userEvent.click(screen.getByRole('button', { name: '‹ Back to Discover' }))
    expect(await screen.findByRole('link', { name: 'Cover story: Cover dish' })).toBeInTheDocument()
    await waitFor(() => expect(urls[urls.length - 1]).not.toContain('tags=Quick'))
  })

  it('does not let the drill-in masquerade as a filter the user chose', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: frontPageRecipes(), nextCursor: null })))
    renderRoute('/discover')
    await screen.findByRole('link', { name: /^Cover story/ })

    await userEvent.click(seeAllIn('Quick tonight'))
    await screen.findByRole('heading', { name: 'Quick tonight', level: 1 })

    // The Quick tag rides on the query, never in the sheet's state — a count
    // here would claim a filter the user never picked, and clearing it in the
    // sheet is exactly the confusing exit this view replaces.
    expect(screen.getByRole('button', { name: 'Filters' })).toBeInTheDocument()
  })

  it('gives the Trending drill-in the same way back', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: frontPageRecipes(), nextCursor: null })))
    renderRoute('/discover')
    await screen.findByRole('link', { name: /^Cover story/ })

    await userEvent.click(seeAllIn('Trending'))

    expect(await screen.findByRole('heading', { name: 'Trending', level: 1 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '‹ Back to Discover' }))
    expect(await screen.findByRole('link', { name: /^Cover story/ })).toBeInTheDocument()
  })

  it('leaves the department when the user asks a question of their own', async () => {
    const user = userEvent.setup()
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: frontPageRecipes(), nextCursor: null })
      }),
    )
    renderRoute('/discover')
    await screen.findByRole('link', { name: /^Cover story/ })

    await user.click(seeAllIn('Quick tonight'))
    await screen.findByRole('heading', { name: 'Quick tonight', level: 1 })

    await openFilters(user)
    await user.click(screen.getByRole('button', { name: 'Medium' }))
    await user.click(screen.getByRole('button', { name: 'Show results' }))

    // A filter of your own replaces the department rather than stacking onto
    // it — otherwise "‹ Back to Discover" would clear the view and strand you
    // on a still-filtered list, having promised the front page.
    await waitFor(() => expect(urls[urls.length - 1]).toContain('difficulty=Medium'))
    expect(urls[urls.length - 1]).not.toContain('tags=Quick')
    expect(screen.queryByRole('button', { name: '‹ Back to Discover' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Quick tonight', level: 1 })).toBeNull()
  })
})
