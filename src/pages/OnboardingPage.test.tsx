import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { guestAuthValue, renderRoute } from '@/test/utils'

// ─────────────────────────────────────────────────────────────────────────
// /welcome — the skippable post-register wizard (stream K).
//
// The assertions worth having here are about the SKIP path and the two-step
// separation, not about chips toggling. A wizard that cannot be escaped, or
// one whose skip fails to record itself, is the failure that would actually
// reach a user — and "skip still writes" is counter-intuitive enough that it
// would be the first thing an unwitting refactor removed.
// ─────────────────────────────────────────────────────────────────────────

/** Capture what the wizard POSTs, and answer with a profile. */
function captureOnboarding(): { body: () => unknown } {
  let captured: unknown = null
  server.use(
    http.post('/api/users/me/onboarding', async ({ request }) => {
      captured = await request.json()
      return HttpResponse.json(makeUserProfile())
    }),
  )
  return { body: () => captured }
}

describe('OnboardingPage', () => {
  it('sends the chosen cuisines and restrictions, then leaves for the destination', async () => {
    const user = userEvent.setup()
    const capture = captureOnboarding()
    const router = renderRoute('/welcome')

    await screen.findByText('What do you like to cook?')
    await user.click(await screen.findByRole('checkbox', { name: 'Thai' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Italian' }))

    await user.click(screen.getByRole('button', { name: 'Next' }))

    // Step 2 is a different vocabulary — the cuisine chips are gone.
    await screen.findByText('Anything you avoid?')
    expect(screen.queryByRole('checkbox', { name: 'Thai' })).toBeNull()
    await user.click(await screen.findByRole('checkbox', { name: 'Vegan' }))

    await user.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'))
    expect(capture.body()).toEqual({
      // Saved in vocabulary order, not click order.
      cuisinePreferences: ['Italian', 'Thai'],
      dietaryRestrictions: ['Vegan'],
    })
  })

  // Skipping is an ANSWER, not a deferral: it posts empty lists, which is what
  // stamps the account as onboarded server-side. If this ever became a plain
  // navigate(), the wizard would greet the user again on every single boot.
  it('still records an empty answer when the wizard is skipped', async () => {
    const user = userEvent.setup()
    const capture = captureOnboarding()
    const router = renderRoute('/welcome')

    await user.click(await screen.findByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'))
    expect(capture.body()).toEqual({ cuisinePreferences: [], dietaryRestrictions: [] })
  })

  // A network failure must not trap someone who asked to leave. Failing this
  // direction costs one extra prompt on the next boot; failing the other way
  // strands the user in a wizard they explicitly declined.
  it('lets the user leave even when the skip write fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/users/me/onboarding', () => HttpResponse.error()))
    const router = renderRoute('/welcome')

    await user.click(await screen.findByRole('button', { name: 'Skip for now' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/discover'))
  })

  // The mirror image: choices the user actually made are never silently
  // dropped, so a failed Finish stays put and says so.
  it('keeps the user on the wizard when saving real choices fails', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/users/me/onboarding', () => HttpResponse.error()))
    const router = renderRoute('/welcome')

    await user.click(await screen.findByRole('checkbox', { name: 'Thai' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Finish' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i)
    expect(router.state.location.pathname).toBe('/welcome')
  })

  it('redirects a signed-out visitor to the login page', async () => {
    const router = renderRoute('/welcome', { auth: guestAuthValue() })

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})

// Silence the expected console noise from the deliberate network failures above.
vi.spyOn(console, 'error').mockImplementation(() => {})
