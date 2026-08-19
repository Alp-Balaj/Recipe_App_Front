import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderApp } from '@/test/utils'
import { refreshSession } from '@/api/client'

/**
 * KAN-21 — "every live session is warned".
 *
 * A second-factor reset somebody started by email is a 48-hour countdown, and the only person
 * who can stop it is whoever is still signed in — stopping it needs a session, which needs
 * the factor. So the warning has to find that person wherever they are, including in a tab
 * that has been open since before the countdown started.
 *
 * The mechanism is that identity carries it and identity is re-read: on boot, after every
 * sign-in, and on every refresh. These tests pin the two paths that are easy to lose, because
 * losing either one is SILENT — the strip simply never appears, and the feature looks fine.
 */
describe('the pending-reset warning', () => {
  const EFFECTIVE_AT = '2026-08-21T09:30:00.000Z'

  const bootedUser = (pending: string | null) => ({
    userId: '11111111-1111-1111-1111-111111111111',
    username: 'booteduser',
    role: 'User' as const,
    secondFactorResetEffectiveAtUtc: pending,
  })

  it('appears on boot when the identity read says a reset is pending', () => {
    localStorage.setItem('recipe_app_session', '1')
    server.use(http.get('*/auth/me', () => HttpResponse.json(bootedUser(EFFECTIVE_AT))))

    renderApp('/discover')

    return waitFor(() =>
      expect(screen.getByText(/someone asked to turn off two-step sign-in/i)).toBeInTheDocument(),
    )
  })

  it('stays away when nothing is pending', async () => {
    localStorage.setItem('recipe_app_session', '1')
    server.use(http.get('*/auth/me', () => HttpResponse.json(bootedUser(null))))

    renderApp('/discover')

    await screen.findByText(/./)
    expect(screen.queryByText(/someone asked to turn off two-step sign-in/i)).not.toBeInTheDocument()
  })

  // The long-open-tab path. A refresh is the one call every live session makes on its own,
  // so it is where a tab that booted hours ago learns anything new about its own account. If
  // the wrapper ever goes back to discarding the refresh body, this fails — and nothing else
  // would, because the boot path above would still be green.
  it('appears in a tab that was already open, on its next refresh', async () => {
    localStorage.setItem('recipe_app_session', '1')
    server.use(
      http.get('*/auth/me', () => HttpResponse.json(bootedUser(null))),
      http.post('*/auth/refresh', () => HttpResponse.json(bootedUser(EFFECTIVE_AT))),
    )

    renderApp('/discover')
    await waitFor(() =>
      expect(screen.queryByText(/someone asked to turn off/i)).not.toBeInTheDocument(),
    )

    // What the wrapper does by itself whenever an access cookie ages out mid-session.
    await refreshSession()

    await waitFor(() =>
      expect(screen.getByText(/someone asked to turn off two-step sign-in/i)).toBeInTheDocument(),
    )
  })
})
