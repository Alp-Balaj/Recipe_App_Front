import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
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
    tags: ['quick'],
    createdByUserId: 'someone',
    ...over,
  }
}

/** MSW GET /recipes that records the last request URL for assertions. */
function listHandler(handler: (url: URL) => Response) {
  return http.get('*/recipes', ({ request }) => handler(new URL(request.url)))
}

describe('BrowsePage', () => {
  it('renders the fetched recipe cards', async () => {
    server.use(
      listHandler(() =>
        HttpResponse.json({ items: [makeRecipe({ title: 'Miso ramen' }), makeRecipe({ title: 'Lentil soup' })], nextCursor: null }),
      ),
    )
    renderRoute('/library')
    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()
    expect(screen.getByText('Lentil soup')).toBeInTheDocument()
    expect(screen.getByText("That's everything.")).toBeInTheDocument()
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
    renderRoute('/library')
    expect(await screen.findByText('Page one recipe')).toBeInTheDocument()

    await userEvent.click(screen.getByText('Load more'))
    expect(await screen.findByText('Page two recipe')).toBeInTheDocument()
    // First page's recipe still present exactly once (no dupes).
    expect(screen.getAllByText('Page one recipe')).toHaveLength(1)
    expect(screen.getByText("That's everything.")).toBeInTheDocument()
  })

  it('sends difficulty + tag filters as query params and resets pagination on change', async () => {
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [makeRecipe({ title: 'Filtered recipe' })], nextCursor: null })
      }),
    )
    renderRoute('/library')
    expect(await screen.findByText('Filtered recipe')).toBeInTheDocument()

    // Difficulty chip → difficulty param.
    await userEvent.click(screen.getByText('Medium'))
    await waitFor(() => expect(urls.some((u) => u.includes('difficulty=Medium'))).toBe(true))

    // Tag input, lowercased, sent as repeated tags param.
    const tagInput = screen.getByLabelText('Filter by tag')
    await userEvent.type(tagInput, 'Vegan{Enter}')
    await waitFor(() => expect(urls.some((u) => u.includes('tags=vegan'))).toBe(true))

    // Every request starts a fresh page (no cursor carried across filter changes).
    expect(urls.every((u) => !u.includes('cursor='))).toBe(true)
  })

  it('shows the empty state when no recipes match', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [], nextCursor: null })))
    renderRoute('/library')
    expect(await screen.findByText('No recipes found')).toBeInTheDocument()
  })

  it('shows an error state with retry on failure', async () => {
    server.use(listHandler(() => new HttpResponse(null, { status: 500 })))
    renderRoute('/library')
    expect(await screen.findByText("Couldn't load recipes", undefined, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('navigates to the detail route when a card is tapped', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe({ id: 'go-here', title: 'Tap me' })], nextCursor: null })))
    const router = renderRoute('/library')
    await userEvent.click(await screen.findByText('Tap me'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/go-here'))
  })

  // ── Accessibility (fe · consolidation) ────────────────────────────────────

  it('activates a focused recipe card with the Enter key', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe({ id: 'kbd-enter', title: 'Enter recipe' })], nextCursor: null })))
    const router = renderRoute('/library')
    const card = await screen.findByRole('link', { name: 'Enter recipe' })
    card.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/kbd-enter'))
  })

  it('activates a focused recipe card with the Space key', async () => {
    server.use(listHandler(() => HttpResponse.json({ items: [makeRecipe({ id: 'kbd-space', title: 'Space recipe' })], nextCursor: null })))
    const router = renderRoute('/library')
    const card = await screen.findByRole('link', { name: 'Space recipe' })
    card.focus()
    await userEvent.keyboard(' ')
    await waitFor(() => expect(router.state.location.pathname).toBe('/recipes/kbd-space'))
  })

  it('applies a difficulty filter when the chip is activated by keyboard', async () => {
    const urls: string[] = []
    server.use(
      listHandler((url) => {
        urls.push(url.pathname + url.search)
        return HttpResponse.json({ items: [makeRecipe({ title: 'Kbd filtered' })], nextCursor: null })
      }),
    )
    renderRoute('/library')
    expect(await screen.findByText('Kbd filtered')).toBeInTheDocument()

    const chip = screen.getByRole('button', { name: 'Medium' })
    chip.focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(urls.some((u) => u.includes('difficulty=Medium'))).toBe(true))
  })
})
