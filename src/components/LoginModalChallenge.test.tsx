import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { AuthGateProvider } from '@/auth/AuthGateContext'
import { guestAuthValue } from '@/test/utils'
import LoginModal from './LoginModal'

/**
 * KAN-21 — the guest sign-in modal is the app's OTHER sign-in, and it has to ask for a code
 * exactly as /login does.
 *
 * This file exists because of the specific way that can go wrong, which the compiler cannot
 * catch: `login()` now RETURNS a challenge, and a caller that discards the return value and
 * closes the prompt leaves a guest who typed the right password still a guest — with no code
 * prompt and no error. The next gated tap reopens the modal, forever.
 */
describe('the guest sign-in modal, when the account has a second factor', () => {
  const CHALLENGE = {
    challengeToken: 'challenge-token-abc',
    expiresAtUtc: new Date(Date.now() + 5 * 60_000).toISOString(),
    challengeRequired: true,
  }

  function renderModal(overrides: Partial<AuthContextValue> = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const auth = guestAuthValue({
      login: async () => CHALLENGE as never,
      ...overrides,
    })

    render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={auth}>
          <MemoryRouter>
            <AuthGateProvider>
              <LoginModal />
            </AuthGateProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  }

  async function signIn() {
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/username or email/i), 'cook')
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))
    return user
  }

  it('asks for a code rather than closing as if the password were enough', async () => {
    renderModal()

    await signIn()

    expect(await screen.findByLabelText(/authentication code/i)).toBeInTheDocument()
    // The password fields are gone: the modal moved on to the second step rather than
    // sitting there looking like nothing happened.
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument()
  })

  it('adopts the session once the code is accepted', async () => {
    const adoptSession = vi.fn()
    server.use(
      http.post('*/auth/challenge', () =>
        HttpResponse.json({ userId: 'u1', username: 'cook', role: 'User' }),
      ),
    )
    renderModal({ adoptSession })

    const user = await signIn()
    await user.type(await screen.findByLabelText(/authentication code/i), '123456')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() =>
      expect(adoptSession).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', username: 'cook' }),
      ),
    )
  })
})
