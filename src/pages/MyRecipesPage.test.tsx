import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { RecipeResponse } from '@/api/types'

const ME = '11111111-1111-1111-1111-111111111111' // TEST_USER.userId
const OTHER = '22222222-2222-2222-2222-222222222222'

function makeRecipe(overrides: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: 'r1',
    title: 'A recipe',
    description: 'desc',
    prepTimeMinutes: 5,
    cookTimeMinutes: 10,
    totalTimeMinutes: 15,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: null,
    caloriesPerServing: 300,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: null,
    ingredients: [{ name: 'Salt', quantity: 1, unit: 'tsp' }],
    steps: [{ stepNumber: 1, description: 'Mix', timerSeconds: null }],
    tags: ['savory'],
    createdByUserId: ME,
    ...overrides,
  }
}

describe('MyRecipesPage', () => {
  // The page used to page the GLOBAL list and filter by author in the browser,
  // which silently lost anything past the page cap. It now asks the server for
  // the caller's recipes directly, so the assertion moved: not "it filtered
  // correctly" but "it asked the right endpoint and rendered what came back".
  it('reads the caller-scoped endpoint and renders everything it returns', async () => {
    let globalListCalls = 0
    server.use(
      http.get('*/recipes/mine', () =>
        HttpResponse.json({
          items: [
            makeRecipe({ id: 'a', title: 'Mine A' }),
            // A private draft: invisible in GET /recipes for everyone but its
            // author, so the old client-side filter could never have shown it.
            makeRecipe({ id: 'c', title: 'Mine C', visibility: 'Private' }),
          ],
          nextCursor: null,
        }),
      ),
      // Sentinel: if the page ever falls back to the global list, this fires and
      // "Someone Else" shows up in the output.
      http.get('*/recipes', () => {
        globalListCalls += 1
        return HttpResponse.json({
          items: [makeRecipe({ id: 'b', title: 'Someone Else', createdByUserId: OTHER })],
          nextCursor: null,
        })
      }),
    )

    renderRoute('/recipes/mine')

    expect(await screen.findByText('Mine A')).toBeInTheDocument()
    expect(screen.getByText('Mine C')).toBeInTheDocument()
    expect(screen.queryByText('Someone Else')).not.toBeInTheDocument()
    // The point of the change: the global list is never touched, so a page of
    // other people's recipes can't crowd yours out.
    expect(globalListCalls).toBe(0)
  })

  it('deletes a recipe after confirmation and drops it from the list', async () => {
    const user = userEvent.setup()
    let recipes = [makeRecipe({ id: 'r1', title: 'Deletable', createdByUserId: ME })]
    const deleteSpy = vi.fn()
    server.use(
      http.get('*/recipes/mine', () => HttpResponse.json({ items: recipes, nextCursor: null })),
      http.delete('*/recipes/r1', () => {
        deleteSpy()
        recipes = recipes.filter((r) => r.id !== 'r1')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderRoute('/recipes/mine')

    await user.click(await screen.findByRole('button', { name: /^delete$/i }))
    // Confirmation dialog appears.
    expect(await screen.findByText('Delete this recipe?')).toBeInTheDocument()

    // Two "Delete" buttons now (card + dialog); the dialog's is the last one.
    const deletes = screen.getAllByRole('button', { name: /^delete$/i })
    await user.click(deletes[deletes.length - 1])

    await waitFor(() => expect(deleteSpy).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Deletable')).not.toBeInTheDocument())
    expect(screen.getByText(/haven't posted any recipes/i)).toBeInTheDocument()
  })

  it('edits a recipe: prefilled overlay → PUT /recipes/{id} → closes', async () => {
    const user = userEvent.setup()
    let recipes = [makeRecipe({ id: 'r1', title: 'Old Title', createdByUserId: ME })]
    let putBody: { title: string } | null = null
    server.use(
      http.get('*/recipes/mine', () => HttpResponse.json({ items: recipes, nextCursor: null })),
      http.put('*/recipes/r1', async ({ request }) => {
        putBody = (await request.json()) as { title: string }
        const updated = { ...recipes[0], title: putBody.title }
        recipes = [updated]
        return HttpResponse.json(updated)
      }),
    )

    renderRoute('/recipes/mine')

    await user.click(await screen.findByRole('button', { name: /^edit$/i }))
    const titleInput = await screen.findByLabelText('Title')
    expect(titleInput).toHaveValue('Old Title')

    await user.clear(titleInput)
    await user.type(titleInput, 'New Title')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(putBody).not.toBeNull())
    expect((putBody as unknown as { title: string }).title).toBe('New Title')
    // Overlay closed.
    await waitFor(() => expect(screen.queryByText('Edit recipe')).not.toBeInTheDocument())
  })

  it('surfaces a distinct message when PUT returns 403', async () => {
    const user = userEvent.setup()
    const recipes = [makeRecipe({ id: 'r1', title: 'Old Title', createdByUserId: ME })]
    server.use(
      http.get('*/recipes/mine', () => HttpResponse.json({ items: recipes, nextCursor: null })),
      http.put('*/recipes/r1', () => new HttpResponse(null, { status: 403 })),
    )

    renderRoute('/recipes/mine')

    await user.click(await screen.findByRole('button', { name: /^edit$/i }))
    await user.click(await screen.findByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/don't have permission to edit/i)).toBeInTheDocument()
    // Overlay closed on the 403 (page-level handling).
    await waitFor(() => expect(screen.queryByText('Edit recipe')).not.toBeInTheDocument())
  })
})
