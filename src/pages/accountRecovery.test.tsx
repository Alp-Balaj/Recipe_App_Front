// ─────────────────────────────────────────────────────────────────────────
// Account recovery (KAN-19) — the three screens behind an emailed link.
//
// Every case here renders through the REAL route tree, so the routes being
// registered and reachable is part of what is under test rather than something
// assumed. Most of them render as a GUEST (`renderGuestRoute`), because that is
// the whole point of the feature: someone who has lost their password has lost
// the session too, and a recovery screen that only works when signed in is not a
// recovery screen.
//
// `renderApp` (real AuthProvider + MSW) is used where the session itself is what
// is being asserted — the reset that must sign the user in on this device.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeAuthResponse } from '@/test/msw/handlers'
import { renderApp, renderGuestRoute, renderRoute } from '@/test/utils'

afterEach(() => localStorage.clear())

/** The backend's answer for a link that is past its lifetime. */
const gone = () => HttpResponse.json({ error: 'expired' }, { status: 410 })
/** …and for one that was never usable: fabricated, superseded, or already spent. */
const unusable = () => HttpResponse.json({ error: 'invalid' }, { status: 400 })

describe('ForgotPasswordPage', () => {
  it('sends the typed address and confirms without saying whether it has an account', async () => {
    const user = userEvent.setup()
    let sentTo: string | null = null
    server.use(
      http.post('*/auth/password-reset/request', async ({ request }) => {
        sentTo = ((await request.json()) as { email: string }).email
        return new HttpResponse(null, { status: 202 })
      }),
    )

    renderGuestRoute('/forgot-password')

    await user.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(sentTo).toBe('alice@example.com')
    // Conditional wording — "we've sent you a link" — would be the enumeration
    // oracle the server refuses to be, rebuilt in the client.
    expect(screen.getByText(/if an account exists/i)).toBeInTheDocument()
  })

  it('confirms identically for an address with no account', async () => {
    const user = userEvent.setup()
    renderGuestRoute('/forgot-password')

    await user.type(await screen.findByLabelText('Email'), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText('Check your inbox')).toBeInTheDocument()
    expect(screen.getByText(/if an account exists for nobody@example\.com/i)).toBeInTheDocument()
  })

  it('blocks a malformed address client-side without calling the server', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    server.use(
      http.post('*/auth/password-reset/request', () => {
        spy()
        return new HttpResponse(null, { status: 202 })
      }),
    )

    renderGuestRoute('/forgot-password')

    await user.type(await screen.findByLabelText('Email'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('LoginPage — the way in to recovery', () => {
  it('offers "forgot your password?" at the moment it is needed', async () => {
    const user = userEvent.setup()
    const router = renderGuestRoute('/login')

    await user.click(await screen.findByRole('link', { name: /forgot your password/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/forgot-password'))
    expect(await screen.findByText('Forgot your password?')).toBeInTheDocument()
  })
})

describe('ResetPasswordPage', () => {
  it('sets the new password, signs this device in, and lands in the app', async () => {
    const user = userEvent.setup()
    let sent: { token: string; newPassword: string } | null = null
    server.use(
      http.post('*/auth/password-reset/confirm', async ({ request }) => {
        sent = (await request.json()) as { token: string; newPassword: string }
        return HttpResponse.json(makeAuthResponse('reset_alice'))
      }),
    )

    const router = renderApp('/reset-password?token=good-token')

    await user.type(await screen.findByLabelText('New password'), 'BrandNewPass9')
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass9')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'))
    expect(sent).toEqual({ token: 'good-token', newPassword: 'BrandNewPass9' })
    // The returned session was adopted — the user is not bounced to /login to
    // type the password they chose a second ago.
    expect(localStorage.getItem('recipe_app_auth')).toContain('reset_alice')
  })

  it('offers a fresh link when the one used has expired', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/auth/password-reset/confirm', gone))

    renderGuestRoute('/reset-password?token=stale-token')

    await user.type(await screen.findByLabelText('New password'), 'BrandNewPass9')
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass9')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('That link has expired')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /send a new link/i })).toBeInTheDocument()
  })

  it('says a spent or superseded link is not usable', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/auth/password-reset/confirm', unusable))

    renderGuestRoute('/reset-password?token=already-used')

    await user.type(await screen.findByLabelText('New password'), 'BrandNewPass9')
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass9')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('That link is not usable')).toBeInTheDocument()
  })

  it('shows the dead end straight away when the URL carries no token', async () => {
    const spy = vi.fn()
    server.use(
      http.post('*/auth/password-reset/confirm', () => {
        spy()
        return HttpResponse.json(makeAuthResponse('nobody'))
      }),
    )

    renderGuestRoute('/reset-password')

    expect(await screen.findByText('That link is not usable')).toBeInTheDocument()
    // No form to submit, and nothing was asked of the server.
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  // Mirrors PasswordRules on the backend, so a password the server would reject
  // never costs the user a round trip — or, worse, a link.
  it('applies the registration password rules before submitting', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    server.use(
      http.post('*/auth/password-reset/confirm', () => {
        spy()
        return HttpResponse.json(makeAuthResponse('nobody'))
      }),
    )

    renderGuestRoute('/reset-password?token=good-token')

    await user.type(await screen.findByLabelText('New password'), 'letters')
    await user.type(screen.getByLabelText('Confirm new password'), 'letters')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses a confirmation that does not match', async () => {
    const user = userEvent.setup()
    const spy = vi.fn()
    server.use(
      http.post('*/auth/password-reset/confirm', () => {
        spy()
        return HttpResponse.json(makeAuthResponse('nobody'))
      }),
    )

    renderGuestRoute('/reset-password?token=good-token')

    await user.type(await screen.findByLabelText('New password'), 'BrandNewPass9')
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass8')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('Both passwords must match')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  // The server's rules are the authority. A 400 carrying a validation dictionary
  // is NOT a dead link, and must not be reported as one.
  it('surfaces a server-side password rejection without killing the link', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/auth/password-reset/confirm', () =>
        HttpResponse.json(
          { errors: { NewPassword: ['Password must contain at least one digit.'] } },
          { status: 400 },
        ),
      ),
    )

    renderGuestRoute('/reset-password?token=good-token')

    await user.type(await screen.findByLabelText('New password'), 'BrandNewPass9')
    await user.type(screen.getByLabelText('Confirm new password'), 'BrandNewPass9')
    await user.click(screen.getByRole('button', { name: /save new password/i }))

    expect(await screen.findByText('Password must contain at least one digit.')).toBeInTheDocument()
    // Still on the form, so a corrected password can be submitted against the SAME link.
    expect(screen.getByLabelText('New password')).toBeInTheDocument()
    expect(screen.queryByText('That link is not usable')).not.toBeInTheDocument()
  })
})

describe('VerifyEmailPage', () => {
  it('confirms the address from a link clicked while signed out', async () => {
    let sentToken: string | null = null
    server.use(
      http.post('*/auth/email-verification/confirm', async ({ request }) => {
        sentToken = ((await request.json()) as { token: string }).token
        return HttpResponse.json({ status: 'Verified' })
      }),
    )

    renderGuestRoute('/verify-email?token=link-token')

    expect(await screen.findByText('Email verified')).toBeInTheDocument()
    expect(sentToken).toBe('link-token')
  })

  // A second click is a harmless repeat and must not read as a failure.
  it('reports a repeat click as already verified, not as an error', async () => {
    server.use(
      http.post('*/auth/email-verification/confirm', () =>
        HttpResponse.json({ status: 'AlreadyVerified' }),
      ),
    )

    renderGuestRoute('/verify-email?token=link-token')

    expect(await screen.findByText('Already verified')).toBeInTheDocument()
  })

  it('lets a signed-in reader ask for a replacement when the link has expired', async () => {
    const user = userEvent.setup()
    const resend = vi.fn()
    server.use(
      http.post('*/auth/email-verification/confirm', gone),
      http.post('*/auth/email-verification/request', () => {
        resend()
        return new HttpResponse(null, { status: 202 })
      }),
    )

    renderRoute('/verify-email?token=stale-token')

    expect(await screen.findByText('That link has expired')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /send a new verification email/i }))

    expect(await screen.findByRole('button', { name: /sent — check your inbox/i })).toBeInTheDocument()
    expect(resend).toHaveBeenCalledTimes(1)
  })

  // A guest cannot be offered a resend: that endpoint reads the caller's own
  // address off their session, and they have not got one.
  it('points a signed-out reader at sign-in instead of offering a resend', async () => {
    server.use(http.post('*/auth/email-verification/confirm', gone))

    renderGuestRoute('/verify-email?token=stale-token')

    expect(await screen.findByText('That link has expired')).toBeInTheDocument()
    // No resend BUTTON — that endpoint reads the caller's own address off a session this
    // reader has not got — but a real way out all the same, not a sentence of instructions.
    expect(screen.queryByRole('button', { name: /send a new verification email/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /sign in to send a new link/i })).toBeInTheDocument()
  })

  // "Invalid" is overwhelmingly a SUPERSEDED link — asked twice, clicked the
  // older message — so it is worded differently from expired but must offer the
  // same way out rather than stranding the commonest case.
  it('words a superseded link differently but still offers a replacement', async () => {
    server.use(http.post('*/auth/email-verification/confirm', unusable))

    renderRoute('/verify-email?token=superseded')

    expect(await screen.findByText('That link is not usable')).toBeInTheDocument()
    expect(screen.queryByText('That link has expired')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send a new verification email/i })).toBeInTheDocument()
  })

  it('does not call the server at all when the URL carries no token', async () => {
    const spy = vi.fn()
    server.use(
      http.post('*/auth/email-verification/confirm', () => {
        spy()
        return HttpResponse.json({ status: 'Verified' })
      }),
    )

    renderGuestRoute('/verify-email')

    expect(await screen.findByText('That link is not usable')).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})
