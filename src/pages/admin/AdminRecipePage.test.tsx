import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeAuthValue, renderRoute, TEST_ADMIN } from '@/test/utils'
import type { AdminRecipeResponse } from '@/api/admin'

const RECIPE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function makeRecipe(over: Partial<AdminRecipeResponse> = {}): AdminRecipeResponse {
  return {
    id: RECIPE_ID,
    title: 'Miso ramen',
    description: 'A warming vegetarian broth with deep umami flavour.',
    visibility: 'Public',
    isDeleted: false,
    createdAt: '2026-07-01T00:00:00Z',
    author: { id: 'author-1', username: 'chef_ana' },
    ...over,
  }
}

function renderAsAdmin(path: string) {
  return renderRoute(path, { auth: makeAuthValue({ user: TEST_ADMIN }) })
}

describe('AdminRecipePage', () => {
  it('shows the moderation banner and a Restore button (not Hide) for a hidden recipe', async () => {
    server.use(http.get('*/admin/recipes/:id', () => HttpResponse.json(makeRecipe({ isDeleted: true }))))

    renderAsAdmin(`/admin/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Hidden by moderation')).toBeInTheDocument()
    expect(screen.getByText('Miso ramen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide recipe' })).not.toBeInTheDocument()
  })

  it('shows no banner and a Hide button (not Restore) for a live, public recipe', async () => {
    server.use(http.get('*/admin/recipes/:id', () => HttpResponse.json(makeRecipe())))

    renderAsAdmin(`/admin/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()
    expect(screen.queryByText('Hidden by moderation')).not.toBeInTheDocument()
    expect(screen.queryByText(/Private recipe/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide recipe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
    // Author renders as a link to the admin user detail page.
    expect(screen.getByRole('link', { name: 'chef_ana' })).toHaveAttribute('href', '/admin/users/author-1')
  })

  it('shows the private-recipe banner for a live, non-public recipe', async () => {
    server.use(http.get('*/admin/recipes/:id', () => HttpResponse.json(makeRecipe({ visibility: 'Private' }))))

    renderAsAdmin(`/admin/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Private recipe — visible to you as admin')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide recipe' })).toBeInTheDocument()
  })

  it('shows a not-found state for a 404', async () => {
    server.use(http.get('*/admin/recipes/:id', () => new HttpResponse(null, { status: 404 })))

    renderAsAdmin(`/admin/recipes/${RECIPE_ID}`)

    expect(await screen.findByText('Recipe not found')).toBeInTheDocument()
  })
})
