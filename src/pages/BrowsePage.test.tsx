import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
