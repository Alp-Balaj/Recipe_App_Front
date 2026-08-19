import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderGuestRoute } from '@/test/utils'
import ResetSecondFactorPage from './ResetSecondFactorPage'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

/**
 * KAN-21 — /reset-second-factor, the slowest rung of the recovery ladder.
 *
 * These tests are mostly about what the page SAYS, because the failure mode here
 * is not a crash — it is a page that reads as finished when nothing has
 * happened yet. Clicking the emailed link starts a 48-hour wait; a user who
 * takes it for "done" spends two days typing a password that is still not
 * enough, and gives up on an account they could have recovered in seconds with
 * a recovery code.
 *
 * Rendered as a GUEST throughout, because that is the only way anyone reaches
 * this page: they cannot finish a sign-in, which is why they are here.
 */
describe('/reset-second-factor', () => {
  it('points at the recovery code first, because that path is instant', async () => {
    renderGuestRoute('/reset-second-factor')

    expect(await screen.findByText(/try a recovery code first/i)).toBeInTheDocument()
    expect(screen.getByText(/48 hours/i)).toBeInTheDocument()
  })

  it('answers an email request without saying whether the address is known', async () => {
    server.use(
      http.post('*/auth/second-factor/reset/request', () => new HttpResponse(null, { status: 202 })),
    )
    renderGuestRoute('/reset-second-factor')
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText(/your email address/i), 'cook@example.com')
    await user.click(screen.getByRole('button', { name: /email me a link/i }))

    // "IF that address has an account" — the server answers identically either
    // way, and a page that phrased this as a fact would rebuild the enumeration
    // oracle the server goes out of its way not to be.
    expect(await screen.findByText(/if that address has an account/i)).toBeInTheDocument()
  })

  it('leads with the deadline rather than with "done" when the link is spent', async () => {
    server.use(
      http.post('*/auth/second-factor/reset/confirm', () =>
        HttpResponse.json({ effectiveAtUtc: '2026-08-21T09:30:00.000Z' }),
      ),
    )
    renderGuestRoute('/reset-second-factor?token=abc')

    expect(await screen.findByText(/the clock has started/i)).toBeInTheDocument()
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    // And it says the factor is STILL ON, which is the fact a person about to
    // try their password needs.
    expect(screen.getByText(/two-step sign-in is still on/i)).toBeInTheDocument()
  })

  it('tells the reader they can cancel it if they did not ask', async () => {
    server.use(
      http.post('*/auth/second-factor/reset/confirm', () =>
        HttpResponse.json({ effectiveAtUtc: '2026-08-21T09:30:00.000Z' }),
      ),
    )
    renderGuestRoute('/reset-second-factor?token=abc')

    expect(await screen.findByText(/if it was not you who asked/i)).toBeInTheDocument()
  })

  it('tells an expired link apart from an unusable one', async () => {
    server.use(
      http.post('*/auth/second-factor/reset/confirm', () =>
        HttpResponse.json({ error: 'expired' }, { status: 410 }),
      ),
    )
    renderGuestRoute('/reset-second-factor?token=old')

    // Expired deserves "here, have a fresh one"; invalid deserves "that link is
    // not usable". Offering a new link for a token that was never real is a dead
    // end dressed up as help.
    expect(await screen.findByText(/that link has expired/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /send a new link/i })).toBeInTheDocument()
  })

  // The token is SINGLE-USE and React 18's development StrictMode mounts effects twice.
  // Without a once-guard the first POST spends the link and starts the 48-hour countdown,
  // the second gets a 400, and the page tells the reader their link was never usable while
  // the clock is in fact already running — the worst combination available.
  it('spends the link exactly once, even mounted twice', async () => {
    let posts = 0
    server.use(
      http.post('*/auth/second-factor/reset/confirm', () => {
        posts += 1
        return posts === 1
          ? HttpResponse.json({ effectiveAtUtc: '2026-08-21T09:30:00.000Z' })
          : HttpResponse.json({ error: 'invalid' }, { status: 400 })
      }),
    )

    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/reset-second-factor?token=abc']}>
          <Routes>
            <Route path="/reset-second-factor" element={<ResetSecondFactorPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )

    expect(await screen.findByText(/the clock has started/i)).toBeInTheDocument()
    await waitFor(() => expect(posts).toBe(1))
  })

  it('does not offer a fresh link for one that was never real', async () => {
    server.use(
      http.post('*/auth/second-factor/reset/confirm', () =>
        HttpResponse.json({ error: 'invalid' }, { status: 400 }),
      ),
    )
    renderGuestRoute('/reset-second-factor?token=nonsense')

    expect(await screen.findByText(/that link is not usable/i)).toBeInTheDocument()
  })
})
