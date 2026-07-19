import { describe, expect, it } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { makeAuthValue, renderRoute } from './utils'
import { server } from './msw/server'

describe('router shell (authenticated)', () => {
  it('redirects / to /library', async () => {
    const router = renderRoute('/')
    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/library')
  })

  it('redirects unknown URLs to /library instead of crashing', async () => {
    const router = renderRoute('/definitely/not/a/route')
    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/library')
  })

  it('renders the chat teaser at /chat', async () => {
    renderRoute('/chat')
    expect(await screen.findByText('What are we cooking?')).toBeInTheDocument()
  })

  it('renders the profile at /profile', async () => {
    renderRoute('/profile')
    // 'Profile' alone also matches the nav label; 'Appearance' is unique to the tab body.
    expect(await screen.findByText('Appearance')).toBeInTheDocument()
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
          ingredients: [{ name: 'miso', quantity: 3, unit: 'tbsp' }],
          steps: [{ stepNumber: 1, description: 'Simmer.', timerSeconds: null }],
          tags: ['warm'],
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
    renderRoute('/library')
    const active = await screen.findByRole('button', { current: 'page' })
    expect(active).toHaveTextContent('Library')
  })

  it('flips data-mode when the profile theme toggle is used', async () => {
    renderRoute('/profile')
    const shell = document.querySelector('.app-shell')
    // The imported redesign is dark-native, so the app opens in dark mode.
    expect(shell).toHaveAttribute('data-mode', 'dark')
    await userEvent.click(await screen.findByText('☀ Light'))
    expect(shell).toHaveAttribute('data-mode', 'light')
    await userEvent.click(await screen.findByText('☾ Dark'))
    expect(shell).toHaveAttribute('data-mode', 'dark')
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

describe('route protection', () => {
  it('bounces an unauthenticated user from a protected route to /login', async () => {
    const router = renderRoute('/library', {
      auth: makeAuthValue({ user: null, status: 'unauthenticated' }),
    })
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('holds a loading placeholder while the session is being validated', async () => {
    renderRoute('/library', { auth: makeAuthValue({ user: null, status: 'loading' }) })
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
  })
})
