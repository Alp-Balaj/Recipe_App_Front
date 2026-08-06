import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeAuthResponse, TAKEN_USERNAME, WRONG_PASSWORD } from '@/test/msw/handlers'
import { renderApp } from '@/test/utils'

describe('LoginPage', () => {
  it('signs in and redirects to the app on valid credentials', async () => {
    const user = userEvent.setup()
    const router = renderApp('/login')

    await user.type(await screen.findByLabelText('Username or email'), 'alice')
    await user.type(screen.getByLabelText('Password'), 'goodpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Explore recipes')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/discover')
    expect(localStorage.getItem('recipe_app_auth')).toContain('alice')
  })

  it('shows invalid-credentials on a 401 without clearing the session/redirecting', async () => {
    const user = userEvent.setup()
    const router = renderApp('/login')

    await user.type(await screen.findByLabelText('Username or email'), 'alice')
    await user.type(screen.getByLabelText('Password'), WRONG_PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Invalid username or password.')).toBeInTheDocument()
    // Still on /login — the login 401 is exempt from the session-clear redirect.
    expect(router.state.location.pathname).toBe('/login')
  })

  it('blocks submission client-side when fields are empty', async () => {
    const user = userEvent.setup()
    const loginSpy = vi.fn()
    server.use(
      http.post('*/auth/login', () => {
        loginSpy()
        return HttpResponse.json(makeAuthResponse('nobody'))
      }),
    )

    renderApp('/login')
    await user.click(await screen.findByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter your username or email')).toBeInTheDocument()
    expect(loginSpy).not.toHaveBeenCalled()
  })
})

describe('RegisterPage', () => {
  it('registers and logs in with a SINGLE call (no follow-up login)', async () => {
    const user = userEvent.setup()
    const loginSpy = vi.fn()
    server.use(
      http.post('*/auth/login', () => {
        loginSpy()
        return HttpResponse.json(makeAuthResponse('should-not-happen'))
      }),
    )

    const router = renderApp('/register')

    await user.type(await screen.findByLabelText('Username'), 'bob')
    await user.type(screen.getByLabelText('Email'), 'bob@example.com')
    await user.type(screen.getByLabelText('Password'), 'longenough')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    // stream K: a new account lands on the onboarding wizard rather than
    // straight on /discover. What this test is actually for is unchanged and
    // still asserted below — register returns a token, so /auth/login is never
    // called — but the destination moved, so the assertion follows it.
    expect(await screen.findByText('What do you like to cook?')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/welcome')
    // The whole point: register returns a token, so login is never called.
    expect(loginSpy).not.toHaveBeenCalled()
  })

  it('shows the conflict message on a 409 (username/email taken)', async () => {
    const user = userEvent.setup()
    const router = renderApp('/register')

    await user.type(await screen.findByLabelText('Username'), TAKEN_USERNAME)
    await user.type(screen.getByLabelText('Email'), 'taken@example.com')
    await user.type(screen.getByLabelText('Password'), 'longenough')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/already taken/i)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/register')
  })

  it('mirrors the backend validators (username min 3, password min 8)', async () => {
    const user = userEvent.setup()
    renderApp('/register')

    await user.type(await screen.findByLabelText('Username'), 'ab')
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'short')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText('At least 3 characters')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument()
    expect(screen.getByText('At least 8 characters')).toBeInTheDocument()
  })
})

describe('ProfileTab logout', () => {
  it('shows the logged-in username and logs out back to /login', async () => {
    const user = userEvent.setup()
    const router = renderApp('/login')

    // Sign in first.
    await user.type(await screen.findByLabelText('Username or email'), 'carol')
    await user.type(screen.getByLabelText('Password'), 'goodpassword')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    await screen.findByText('Explore recipes')

    // Navigate to the profile tab (bottom nav in the mobile test layout).
    await user.click(screen.getByRole('button', { name: /profile/i }))
    expect(await screen.findByText('carol')).toBeInTheDocument()

    // Log out lives in Settings (design 3e) → open it, then log out.
    await user.click(await screen.findByRole('button', { name: '⚙ Settings' }))
    await user.click(await screen.findByRole('button', { name: /log out/i }))
    expect(await screen.findByText('Welcome back')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(localStorage.getItem('recipe_app_auth')).toBeNull()
  })
})
