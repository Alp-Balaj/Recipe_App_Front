import { describe, expect, it } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { AuthContext } from '@/auth/AuthContext'
import { makeAuthValue } from '@/test/utils'
import SecondFactorPanel from './SecondFactorPanel'

/**
 * KAN-21 — Settings → Security → two-step sign-in.
 *
 * Three of these tests are about COPY, and that is deliberate: the wording is
 * where several of this feature's decisions actually reach a person. That the
 * recovery codes are shown once, that an emailed reset takes two days, that a
 * pending reset can be cancelled — none of those exist for the user unless the
 * screen says them.
 */
describe('the second-factor panel', () => {
  function renderPanel() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={makeAuthValue()}>
          <MemoryRouter>
            <SecondFactorPanel />
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>,
    )
  }

  function status(overrides: Record<string, unknown> = {}) {
    server.use(
      http.get('*/auth/second-factor', () =>
        HttpResponse.json({
          enrolled: false,
          enrolledAt: null,
          recoveryCodesRemaining: 0,
          emailVerified: true,
          resetEffectiveAtUtc: null,
          ...overrides,
        }),
      ),
    )
  }

  // The invariant is "every ENROLLED account has a verified email", because email
  // is one of the recovery paths. Explaining that BEFORE the button is pressed is
  // the difference between a requirement and a mysterious failure.
  it('explains the verified-email requirement instead of offering a button that fails', async () => {
    status({ emailVerified: false })
    renderPanel()

    expect(await screen.findByText(/verify your email address first/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /set up an authenticator/i })).not.toBeInTheDocument()
  })

  it('offers setup once the address is verified', async () => {
    status({ emailVerified: true })
    renderPanel()

    expect(await screen.findByRole('button', { name: /set up an authenticator/i })).toBeInTheDocument()
  })

  // Enrolment has a MIDDLE — a secret exists but the factor does not — and it is
  // that middle which keeps a mis-scanned QR from becoming a locked account.
  it('shows a scannable code and asks for one from it before switching anything on', async () => {
    status({ emailVerified: true })
    server.use(
      http.post('*/auth/second-factor/enrolment', () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpAuthUri: 'otpauth://totp/App:cook@example.com?secret=JBSWY3DPEHPK3PXP',
        }),
      ),
      http.post('*/auth/second-factor/enrolment/confirm', () =>
        HttpResponse.json({ codes: ['ABCDE-FGHJK', '23456-MNPQR'] }),
      ),
    )
    renderPanel()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /set up an authenticator/i }))

    // The typed-by-hand fallback carries the SAME secret as the QR — a desktop
    // browser with no camera has to be able to finish this.
    expect(await screen.findByText(/JBSW Y3DP EHPK 3PXP/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/six-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /turn on two-step sign-in/i }))

    expect(await screen.findByText(/save your recovery codes/i)).toBeInTheDocument()
    expect(screen.getByText('ABCDE-FGHJK')).toBeInTheDocument()
  })

  it('says out loud that the recovery codes are shown once', async () => {
    status({ emailVerified: true })
    server.use(
      http.post('*/auth/second-factor/enrolment', () =>
        HttpResponse.json({ secret: 'JBSWY3DPEHPK3PXP', otpAuthUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' }),
      ),
      http.post('*/auth/second-factor/enrolment/confirm', () =>
        HttpResponse.json({ codes: ['ABCDE-FGHJK'] }),
      ),
    )
    renderPanel()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /set up an authenticator/i }))
    await user.type(await screen.findByLabelText(/six-digit code/i), '123456')
    await user.click(screen.getByRole('button', { name: /turn on two-step sign-in/i }))

    // There is no endpoint that repeats them. A screen that does not say so is
    // one people close.
    expect(await screen.findByText(/only time they are shown/i)).toBeInTheDocument()
  })

  it('keeps the factor on when the confirming code is refused', async () => {
    status({ emailVerified: true })
    server.use(
      http.post('*/auth/second-factor/enrolment', () =>
        HttpResponse.json({ secret: 'JBSWY3DPEHPK3PXP', otpAuthUri: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' }),
      ),
      http.post('*/auth/second-factor/enrolment/confirm', () =>
        HttpResponse.json({ error: 'invalid-code' }, { status: 400 }),
      ),
    )
    renderPanel()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /set up an authenticator/i }))
    await user.type(await screen.findByLabelText(/six-digit code/i), '000000')
    await user.click(screen.getByRole('button', { name: /turn on two-step sign-in/i }))

    expect(await screen.findByText(/that code was not right/i)).toBeInTheDocument()
    expect(screen.queryByText(/save your recovery codes/i)).not.toBeInTheDocument()
  })

  it('asks for a current code before turning the factor off', async () => {
    status({ enrolled: true, enrolledAt: new Date().toISOString(), recoveryCodesRemaining: 7 })
    renderPanel()
    const user = userEvent.setup()

    expect(await screen.findByText(/7 recovery codes left/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /turn off/i }))

    expect(await screen.findByLabelText(/current code/i)).toBeInTheDocument()
    expect(screen.getByText(/a recovery code works here too/i)).toBeInTheDocument()
  })

  // The warning that makes the 48-hour design worth having. Somebody who can
  // read this account's email started a countdown; the person reading this is
  // the only one who can stop it, because stopping it needs the factor.
  it('shows a pending reset with its deadline and a way to cancel it', async () => {
    const effectiveAt = new Date('2026-08-21T09:30:00Z').toISOString()
    status({ enrolled: true, recoveryCodesRemaining: 10, resetEffectiveAtUtc: effectiveAt })
    server.use(
      http.delete('*/auth/second-factor/reset', () => new HttpResponse(null, { status: 204 })),
    )
    renderPanel()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/someone asked to turn off two-step sign-in/i)
    // A relative "in 2 days" would not answer the question the reader has, which
    // is whether there is still time to act.
    expect(alert).toHaveTextContent(/2026/)
    expect(within(alert).getByRole('button', { name: /cancel that request/i })).toBeInTheDocument()
  })

  it('re-reads the status after cancelling, rather than assuming it worked', async () => {
    let cancelled = false
    server.use(
      http.get('*/auth/second-factor', () =>
        HttpResponse.json({
          enrolled: true,
          enrolledAt: null,
          recoveryCodesRemaining: 10,
          emailVerified: true,
          resetEffectiveAtUtc: cancelled ? null : new Date('2026-08-21T09:30:00Z').toISOString(),
        }),
      ),
      http.delete('*/auth/second-factor/reset', () => {
        cancelled = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderPanel()
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /cancel that request/i }))

    await waitFor(() =>
      expect(screen.queryByText(/someone asked to turn off/i)).not.toBeInTheDocument(),
    )
  })
})
