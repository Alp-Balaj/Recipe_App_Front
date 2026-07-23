// ─────────────────────────────────────────────────────────────────────────
// Guest access (guest-access plan §4.8): a signed-out visitor BROWSES the
// public surfaces (feed, discover, recipe detail, public profiles, comment
// lists) and every INTERACTION opens the dismissible login modal instead of
// firing its mutation. MSW serves the anonymous reads (flags false, public
// data); the "mutation not fired" assertions use recording handlers.
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { RecipeResponse } from '@/api/types'
import type { FeedItemResponse } from '@/api/social'
import { renderGuestRoute } from './utils'
import { server } from './msw/server'

// ── fixtures ────────────────────────────────────────────────────────────────

function makeRecipe(over: Partial<RecipeResponse> = {}): RecipeResponse {
  return {
    id: 'guest-recipe-id',
    title: 'Guest Ramen',
    description: 'A public bowl every visitor can read.',
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    totalTimeMinutes: 25,
    servings: 2,
    difficulty: 'Easy',
    cuisineType: 'Japanese',
    caloriesPerServing: 420,
    imageUrl: null,
    visibility: 'Public',
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: null,
    ingredients: [{ name: 'noodles', quantity: 200, unit: 'g' }],
    steps: [{ stepNumber: 1, description: 'Simmer.', timerSeconds: null }],
    tags: ['warm'],
    createdByUserId: 'author-1',
    ...over,
  } as RecipeResponse
}

function makeFeedItem(over: Partial<FeedItemResponse> = {}): FeedItemResponse {
  return {
    recipe: makeRecipe(),
    author: { id: 'author-1', username: 'chef_public', profileImageUrl: null },
    likeCount: 3,
    commentCount: 1,
    likedByMe: false,
    savedByMe: false,
    ...over,
  }
}

const feedWithOneItem = () =>
  http.get('*/feed', () =>
    HttpResponse.json({ items: [makeFeedItem()], nextCursor: null, source: 'forYou' }),
  )

// ── browsing ────────────────────────────────────────────────────────────────

describe('guest browsing', () => {
  it('renders the public feed for a guest (no redirect, guest flags false)', async () => {
    server.use(feedWithOneItem())
    const router = renderGuestRoute('/feed')

    expect(await screen.findByText('Guest Ramen')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/feed')
  })

  it('renders a cold deep link to /recipes/:id for a guest', async () => {
    server.use(http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe())))
    const router = renderGuestRoute('/recipes/guest-recipe-id')

    expect(await screen.findByText('Guest Ramen')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/recipes/guest-recipe-id')
  })

  it('renders a public user profile for a guest', async () => {
    renderGuestRoute('/users/22222222-2222-2222-2222-222222222222')

    // Default MSW profile fixture; the follow button renders (guest is never "own profile").
    expect(await screen.findByText('testuser')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })

  it('lets a guest READ comments on the recipe detail page', async () => {
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe())),
      http.get('*/recipes/:id/comments', () =>
        HttpResponse.json({
          items: [
            {
              id: 'c1',
              content: 'Lovely and warming!',
              createdAt: '2026-07-02T00:00:00Z',
              updatedAt: null,
              authorId: 'author-2',
              authorUsername: 'other_cook',
              recipeId: 'guest-recipe-id',
            },
          ],
          nextCursor: null,
        }),
      ),
    )
    renderGuestRoute('/recipes/guest-recipe-id')

    expect(await screen.findByText('Lovely and warming!')).toBeInTheDocument()
  })
})

// ── gated interactions ──────────────────────────────────────────────────────

describe('guest interaction gating', () => {
  it('save tap on a feed card opens the login modal and does NOT fire the mutation', async () => {
    const user = userEvent.setup()
    let saveFired = false
    server.use(
      feedWithOneItem(),
      http.post('*/recipes/:id/saves', () => {
        saveFired = true
        return new HttpResponse(null, { status: 401 })
      }),
    )
    renderGuestRoute('/feed')
    await screen.findByText('Guest Ramen')

    await user.click(screen.getByLabelText('Save recipe'))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(saveFired).toBe(false)
  })

  it('the Following tab opens the login modal and stays on For You', async () => {
    const user = userEvent.setup()
    server.use(feedWithOneItem())
    renderGuestRoute('/feed')
    await screen.findByText('Guest Ramen')

    await user.click(screen.getByRole('tab', { name: 'Following' }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'For You' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Following' })).toHaveAttribute('aria-selected', 'false')
  })

  it('posting a comment as a guest opens the login modal and does NOT fire the mutation', async () => {
    const user = userEvent.setup()
    let commentFired = false
    server.use(
      http.get('*/recipes/:id', () => HttpResponse.json(makeRecipe())),
      http.post('*/recipes/:id/comments', () => {
        commentFired = true
        return new HttpResponse(null, { status: 401 })
      }),
    )
    renderGuestRoute('/recipes/guest-recipe-id')
    await screen.findByText('Guest Ramen')

    await user.type(screen.getByLabelText('Add a comment'), 'guest tries to comment')
    await user.click(screen.getByRole('button', { name: /Post/ }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(commentFired).toBe(false)
  })

  it('the follow button as a guest opens the login modal and does NOT fire the mutation', async () => {
    const user = userEvent.setup()
    let followFired = false
    server.use(
      http.post('*/users/:id/follow', () => {
        followFired = true
        return new HttpResponse(null, { status: 401 })
      }),
    )
    renderGuestRoute('/users/22222222-2222-2222-2222-222222222222')
    await screen.findByRole('button', { name: 'Follow' })

    await user.click(screen.getByRole('button', { name: 'Follow' }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(followFired).toBe(false)
  })

  it('the Chat tab opens the login modal without navigating', async () => {
    const user = userEvent.setup()
    const router = renderGuestRoute('/discover')
    await screen.findByText('Explore recipes')

    await user.click(screen.getByRole('button', { name: 'Chat' }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/discover')
  })
})

// ── the modal + CTA ─────────────────────────────────────────────────────────

describe('guest CTA + modal dismissal', () => {
  it('shows the persistent sign-in CTA to guests and opens the modal from it', async () => {
    const user = userEvent.setup()
    renderGuestRoute('/discover')
    await screen.findByText('Explore recipes')

    await user.click(screen.getByRole('button', { name: 'Log in / Sign up' }))

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('the login modal is dismissible (the ✕ closes it)', async () => {
    const user = userEvent.setup()
    renderGuestRoute('/discover')
    await screen.findByText('Explore recipes')

    await user.click(screen.getByRole('button', { name: 'Log in / Sign up' }))
    await screen.findByRole('dialog', { name: 'Sign in' })
    await user.click(screen.getByRole('button', { name: 'Close sign-in' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Sign in' })).not.toBeInTheDocument(),
    )
  })
})
