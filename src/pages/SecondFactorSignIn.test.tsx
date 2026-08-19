import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/utils'

/**
 * KAN-21 — signing in when the account has a second factor.
 *
 * The property these tests defend is the one the whole phase rests on: a
 * PASSWORD ALONE GETS YOU NOWHERE for an enrolled account. The screen must not
 * navigate, must not think it is signed in, and must ask for a code — and the
 * ways that could quietly stop being true (treating the challenge body as a
 * session, or as an error) are exactly what is asserted below.
 *
 * Driven through `renderApp`, which mounts the REAL AuthProvider over MSW, so
 * the branch under test is the one in the store rather than a fake.
 */
describe('signing in with a second factor', () => {
  const CHALLENGE = {
    challengeToken: 'challenge-token-abc',
    expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
    challengeRequired: true,
  }

  function loginRaisesAChallenge() {
    server.use(http.post('*/auth/login', () => HttpResponse.json(CHALLENGE)))
  }

  async function signIn() {
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/username or email/i), 'cook')
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    return user
  }

  it('asks for a code instead of signing in', async () => {
    loginRaisesAChallenge()
    const router = renderApp('/login')

    await signIn()

    expect(await screen.findByLabelText(/authentication code/i)).toBeInTheDocument()
    // Still on /login. A challenge that navigated would mean the app had decided
    // a password was enough.
    expect(router.state.location.pathname).toBe('/login')
  })

  it('offers ONE field for both an authenticator code and a recovery code', async () => {
    // The server tells them apart by shape, so the screen must not make somebody
    // classify their own emergency before they can type anything.
    loginRaisesAChallenge()
    renderApp('/login')
    await signIn()

    await screen.findByLabelText(/authentication code/i)
    expect(screen.queryByLabelText(/recovery code/i)).not.toBeInTheDocument()
    expect(screen.getByText(/recovery codes? works? here too/i)).toBeInTheDocument()
  })

  it('signs in once the code is accepted', async () => {
    loginRaisesAChallenge()
    server.use(
      http.post('*/auth/challenge', () =>
        HttpResponse.json({ userId: 'u1', username: 'cook', role: 'User' }),
      ),
    )
    const router = renderApp('/login')
    const user = await signIn()

    await user.type(await screen.findByLabelText(/authentication code/i), '123456')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'))
  })

  it('says how many attempts are left on a wrong code', async () => {
    loginRaisesAChallenge()
    server.use(
      http.post('*/auth/challenge', () =>
        HttpResponse.json({ error: 'invalid-code', attemptsRemaining: 3 }, { status: 401 }),
      ),
    )
    renderApp('/login')
    const user = await signIn()

    await user.type(await screen.findByLabelText(/authentication code/i), '000000')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/3 attempts left/i)).toBeInTheDocument()
  })

  it('warns when one wrong code is left, rather than counting silently', async () => {
    loginRaisesAChallenge()
    server.use(
      http.post('*/auth/challenge', () =>
        HttpResponse.json({ error: 'invalid-code', attemptsRemaining: 1 }, { status: 401 }),
      ),
    )
    renderApp('/login')
    const user = await signIn()

    await user.type(await screen.findByLabelText(/authentication code/i), '000000')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/one more wrong code/i)).toBeInTheDocument()
  })

  // ADR-0008 traded a hard lockout for an escalating delay, and that trade is
  // only defensible because a recovery code still works while the delay runs. A
  // message that says only "wait" would describe the app as the lockout it
  // deliberately is not — so the copy is part of the decision, not decoration.
  it('tells a throttled user that a recovery code still works', async () => {
    loginRaisesAChallenge()
    server.use(
      http.post('*/auth/challenge', () =>
        HttpResponse.json({ error: 'too-many-attempts', retryAfterSeconds: 120 }, { status: 429 }),
      ),
    )
    renderApp('/login')
    const user = await signIn()

    await user.type(await screen.findByLabelText(/authentication code/i), '000000')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    const message = await screen.findByText(/too many attempts/i)
    expect(message).toHaveTextContent(/2 minutes/i)
    expect(message).toHaveTextContent(/recovery code still works/i)
  })

  it('sends the user back to the password when the challenge dies', async () => {
    loginRaisesAChallenge()
    server.use(
      http.post('*/auth/challenge', () =>
        HttpResponse.json({ error: 'challenge-gone' }, { status: 410 }),
      ),
    )
    renderApp('/login')
    const user = await signIn()

    await user.type(await screen.findByLabelText(/authentication code/i), '000000')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    // There is nothing left to type into, so leaving the code field on screen
    // would be inviting a sixth attempt at a challenge that no longer exists.
    expect(await screen.findByText(/that sign-in timed out/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
  })

  it('offers the lost-authenticator route from the code prompt itself', async () => {
    // It has to be HERE. Buried in settings it would sit behind the sign-in the
    // user cannot finish, which is the reason they are looking for it.
    loginRaisesAChallenge()
    renderApp('/login')
    await signIn()

    const link = await screen.findByRole('link', { name: /lost your authenticator/i })
    expect(link).toHaveAttribute('href', '/reset-second-factor')
  })

  it('says to wait rather than implying a lockout when the password is throttled', async () => {
    server.use(
      http.post('*/auth/login', () =>
        HttpResponse.json({ error: 'too-many-attempts', retryAfterSeconds: 4 }, { status: 429 }),
      ),
    )
    renderApp('/login')
    await signIn()

    expect(await screen.findByText(/wait a moment/i)).toBeInTheDocument()
  })
})
