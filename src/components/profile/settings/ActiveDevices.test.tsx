// Settings → Security → Active devices (KAN-20). The screen that gives a user
// the lever they have never had: revoking their own sessions.

import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { renderRoute } from '@/test/utils'
import type { SessionSummary } from '@/api/sessions'

function session(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'Chrome on Windows',
    createdAt: '2026-08-18T09:00:00Z',
    lastSeenAtUtc: new Date().toISOString(),
    current: false,
    ...over,
  }
}

async function openSecurity(user: ReturnType<typeof userEvent.setup>) {
  renderRoute('/profile')
  await user.click(await screen.findByRole('button', { name: '⚙ Settings' }))
  await user.click(await screen.findByRole('button', { name: /security/i }))
}

describe('ActiveDevices', () => {
  it('lists each device and marks the one being used', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/auth/sessions', () =>
        HttpResponse.json([
          session({ id: 'a', label: 'Chrome on Windows', current: true }),
          session({ id: 'b', label: 'Safari on iPhone' }),
        ]),
      ),
    )

    await openSecurity(user)

    expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument()
    expect(screen.getByText('Safari on iPhone')).toBeInTheDocument()
    // Exactly one row says "this is you" — the list is useless if it says none or two.
    expect(screen.getByText('This device')).toBeInTheDocument()
  })

  it('signs out one device and refreshes the list', async () => {
    const user = userEvent.setup()
    let revoked: string | null = null
    let listed = 0

    server.use(
      http.get('*/auth/sessions', () => {
        listed += 1
        return HttpResponse.json(
          listed === 1
            ? [
                session({ id: 'a', label: 'Chrome on Windows', current: true }),
                session({ id: 'b', label: 'Safari on iPhone' }),
              ]
            : [session({ id: 'a', label: 'Chrome on Windows', current: true })],
        )
      }),
      http.delete('*/auth/sessions/:id', ({ params }) => {
        revoked = String(params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await openSecurity(user)
    // The accessible name carries the device: a column of buttons all called
    // "Sign out" tells a screen-reader user nothing about which one they are
    // about to end.
    await user.click(await screen.findByRole('button', { name: 'Sign out Safari on iPhone' }))

    await waitFor(() => expect(revoked).toBe('b'))
    await waitFor(() => expect(screen.queryByText('Safari on iPhone')).not.toBeInTheDocument())
  })

  // The panic button, and the asymmetry that makes it worth pressing: it does not
  // sign you out of the device in your hand.
  it('confirms before signing out the other devices, and says how many', async () => {
    const user = userEvent.setup()
    let calledOthers = false

    server.use(
      http.get('*/auth/sessions', () =>
        HttpResponse.json([
          session({ id: 'a', current: true }),
          session({ id: 'b', label: 'Safari on iPhone' }),
          session({ id: 'c', label: 'Firefox on Linux' }),
        ]),
      ),
      http.delete('*/auth/sessions/others', () => {
        calledOthers = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await openSecurity(user)
    await user.click(await screen.findByRole('button', { name: /sign out all other devices/i }))

    expect(await screen.findByText(/signs out 2 other devices/i)).toBeInTheDocument()
    expect(calledOthers).toBe(false)

    await user.click(screen.getByRole('button', { name: /sign them out/i }))
    await waitFor(() => expect(calledOthers).toBe(true))
  })

  // Offering the panic button to somebody with nothing to panic about is noise,
  // and pressing it would do nothing — which reads as a broken button.
  it('offers no sign-out-others button when this is the only device', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/auth/sessions', () => HttpResponse.json([session({ id: 'a', current: true })])),
    )

    await openSecurity(user)

    expect(await screen.findByText(/only device signed in/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /sign out all other devices/i }),
    ).not.toBeInTheDocument()
  })

  it('says so when the list cannot be read', async () => {
    const user = userEvent.setup()
    server.use(http.get('*/auth/sessions', () => new HttpResponse(null, { status: 500 })))

    await openSecurity(user)

    expect(await screen.findByText(/could not list your devices/i)).toBeInTheDocument()
  })
})
