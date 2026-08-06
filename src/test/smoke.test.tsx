import { describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeAuthValue, renderRoute } from './utils'
import { server } from './msw/server'

describe('router shell (authenticated)', () => {
  it('redirects / to /discover', async () => {
    const router = renderRoute('/')
    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/discover')
  })

  it('redirects unknown URLs to /discover instead of crashing', async () => {
    const router = renderRoute('/definitely/not/a/route')
    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/discover')
  })

  it('renders the chat teaser at /chat', async () => {
    renderRoute('/chat')
    expect(await screen.findByText('What are we cooking?')).toBeInTheDocument()
  })

  it('renders the profile at /profile', async () => {
    renderRoute('/profile')
    // The Settings action is unique to the profile body (design 3b hero).
    expect(await screen.findByRole('button', { name: '⚙ Settings' })).toBeInTheDocument()
  })

  it('deep-links to a recipe detail at /recipes/:id (fetched from the API)', async () => {
    server.use(
      http.get('*/recipes/:id', () =>
        HttpResponse.json({
          id: 'deep-link-id',
          title: 'Miso ramen',
          description: 'A warming vegetarian broth.',
          prepTimeMinutes: 10,
          cookTimeMinutes: 15,
          totalTimeMinutes: 25,
          servings: 2,
          difficulty: 'Medium',
          cuisineType: 'Japanese',
          caloriesPerServing: 420,
          imageUrl: null,
          visibility: 'Public',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: null,
          ingredients: [{ name: 'miso', quantity: 3, unit: 'Tablespoon' }],
          steps: [{ stepNumber: 1, description: 'Simmer.', durationSeconds: null }],
          tags: ['Comfort'],
          createdByUserId: 'someone-else',
        }),
      ),
    )
    renderRoute('/recipes/deep-link-id')
    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()
  })

  it('shows a not-found state when the API 404s a recipe id', async () => {
    server.use(http.get('*/recipes/:id', () => new HttpResponse(null, { status: 404 })))
    renderRoute('/recipes/does-not-exist')
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument()
  })

  it('renders the placeholder pages at /recipes/new and /recipes/mine', async () => {
    renderRoute('/recipes/new')
    expect(await screen.findByText('New recipe')).toBeInTheDocument()
    cleanup()
    renderRoute('/recipes/mine')
    expect(await screen.findByText('My recipes')).toBeInTheDocument()
  })

  it('marks the tab matching the URL as the active one', async () => {
    renderRoute('/discover')
    const active = await screen.findByRole('button', { current: 'page' })
    expect(active).toHaveTextContent('Discover')
  })

  it('flips data-mode when the profile theme toggle is used', async () => {
    renderRoute('/profile')
    const shell = document.querySelector('.app-shell')
    // The imported redesign is light-native, so the app opens in light mode.
    expect(shell).toHaveAttribute('data-mode', 'light')
    // The theme toggle lives in Settings (design 3e).
    await userEvent.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    await userEvent.click(await screen.findByText('☾ Dark'))
    expect(shell).toHaveAttribute('data-mode', 'dark')
    await userEvent.click(await screen.findByText('☀ Light'))
    expect(shell).toHaveAttribute('data-mode', 'light')
  })
})

describe('router shell (auth pages render outside the guard)', () => {
  it('renders the login form at /login', async () => {
    renderRoute('/login', { auth: makeAuthValue({ user: null, status: 'unauthenticated' }) })
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
  })

  it('renders the register form at /register', async () => {
    renderRoute('/register', { auth: makeAuthValue({ user: null, status: 'unauthenticated' }) })
    // 'Create account' is both the heading and the submit button — assert the heading.
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument()
  })
})

describe('route protection (guest access)', () => {
  // Guest access: `unauthenticated` is a browsable state — public routes render
  // for guests instead of bouncing to /login.
  it('renders Discover for a signed-out guest', async () => {
    const router = renderRoute('/discover', {
      auth: makeAuthValue({ user: null, status: 'unauthenticated' }),
    })
    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/discover')
  })

  it('renders Discover behind the login modal when a guest deep-links a gated route', async () => {
    const router = renderRoute('/chat', {
      auth: makeAuthValue({ user: null, status: 'unauthenticated' }),
    })
    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    // No redirect: the URL stays put so signing in can land where the guest aimed.
    expect(router.state.location.pathname).toBe('/chat')
  })

  it('holds a loading placeholder while the session is being validated', async () => {
    renderRoute('/discover', { auth: makeAuthValue({ user: null, status: 'loading' }) })
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })
})
