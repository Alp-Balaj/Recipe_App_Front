import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { routes } from '@/router'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('router shell', () => {
  it('redirects / to /library', async () => {
    const router = renderAt('/')
    expect(await screen.findByText('Your library')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/library')
  })

  it('redirects unknown URLs to /library instead of crashing', async () => {
    const router = renderAt('/definitely/not/a/route')
    expect(await screen.findByText('Your library')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/library')
  })

  it('renders the chat teaser at /chat', async () => {
    renderAt('/chat')
    expect(await screen.findByText('What are we cooking?')).toBeInTheDocument()
  })

  it('renders the profile at /profile', async () => {
    renderAt('/profile')
    // 'Profile' alone also matches the nav label; 'Appearance' is unique to the tab body.
    expect(await screen.findByText('Appearance')).toBeInTheDocument()
  })

  it('deep-links to a mock recipe detail at /recipes/:id', async () => {
    renderAt('/recipes/ramen')
    expect(await screen.findByText('Miso ramen')).toBeInTheDocument()
  })

  it('shows a not-found state for an unknown recipe id', async () => {
    renderAt('/recipes/does-not-exist')
    expect(await screen.findByText('Recipe not found')).toBeInTheDocument()
  })

  it('renders the placeholder pages at /recipes/new and /recipes/mine', async () => {
    renderAt('/recipes/new')
    expect(await screen.findByText('New recipe')).toBeInTheDocument()
    cleanup()
    renderAt('/recipes/mine')
    expect(await screen.findByText('My recipes')).toBeInTheDocument()
  })

  it('renders the auth stubs at /login and /register', async () => {
    renderAt('/login')
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    cleanup()
    renderAt('/register')
    expect(await screen.findByText('Create account')).toBeInTheDocument()
  })

  it('marks the tab matching the URL as the active one', async () => {
    renderAt('/library')
    const active = await screen.findByRole('button', { current: 'page' })
    expect(active).toHaveTextContent('Library')
  })

  it('flips data-mode when the profile theme toggle is used', async () => {
    renderAt('/profile')
    const shell = document.querySelector('.app-shell')
    expect(shell).toHaveAttribute('data-mode', 'dark')
    await userEvent.click(await screen.findByText('☀ Light'))
    expect(shell).toHaveAttribute('data-mode', 'light')
  })
})
