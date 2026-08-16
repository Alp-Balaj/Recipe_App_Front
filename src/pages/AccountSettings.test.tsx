// ─────────────────────────────────────────────────────────────────────────
// Account settings (design 3e/3f) — the Settings menu's Account + Support rows
// and the real Edit profile form behind PUT /users/me. jsdom's matchMedia stub
// reports matches:false, so these run against the mobile profile layout.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeEmailVerificationStatus, makeUserProfile } from '@/test/msw/handlers'
import { makeAuthValue, renderRoute } from '@/test/utils'
import type { UpdateProfileRequest } from '@/api/social'

/** Seed GET /users/{me} so the Edit profile form has values to hydrate from. */
function useProfile(over: Partial<ReturnType<typeof makeUserProfile>> = {}) {
  server.use(http.get('*/users/:id', () => HttpResponse.json(makeUserProfile(over))))
}

async function openSettings() {
  await userEvent.click(await screen.findByRole('button', { name: '⚙ Settings' }))
}

afterEach(() => localStorage.clear())

describe('Settings menu — rows', () => {
  it('renders the Account and Support sections plus the version footer', async () => {
    renderRoute('/profile')
    await openSettings()

    expect(await screen.findByText('Account')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit profile/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Notifications/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Privacy & visibility/ })).toBeInTheDocument()
    expect(screen.getByText('Support')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Help center/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Terms & privacy/ })).toBeInTheDocument()
    expect(screen.getByText(/v2\.0/)).toBeInTheDocument()
  })

  it('opens Help center static content and returns', async () => {
    renderRoute('/profile')
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: /Help center/ }))

    expect(await screen.findByText('Getting started')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Appearance')).toBeInTheDocument()
  })

  it('persists a Notifications toggle to localStorage', async () => {
    renderRoute('/profile')
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }))

    const digest = await screen.findByRole('switch', { name: 'Weekly digest' })
    expect(digest).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(digest)

    await waitFor(() => expect(digest).toHaveAttribute('aria-checked', 'true'))
    expect(localStorage.getItem('pref:notif.digest')).toBe('true')
  })
})

describe('Edit profile — save flow', () => {
  it('hydrates from the profile and PUTs the edited fields', async () => {
    useProfile({ username: 'testuser', bio: 'Old bio', defaultRecipeVisibility: 'FriendsOnly' })

    let sent: UpdateProfileRequest | null = null
    const renamed: string[] = []
    server.use(
      http.put('*/users/me', async ({ request }) => {
        sent = (await request.json()) as UpdateProfileRequest
        return HttpResponse.json(makeUserProfile(sent as Partial<ReturnType<typeof makeUserProfile>>))
      }),
    )

    renderRoute('/profile', { auth: makeAuthValue({ updateUsername: (u) => renamed.push(u) }) })
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: /Edit profile/ }))

    // Hydrated: the seeded default visibility is pre-selected.
    const bio = await screen.findByLabelText('Bio')
    expect(bio).toHaveValue('Old bio')
    expect(screen.getByRole('button', { name: 'Friends' })).toHaveAttribute('aria-pressed', 'true')

    const username = screen.getByLabelText('Username')
    await userEvent.clear(username)
    await userEvent.type(username, 'emmacooks')
    await userEvent.clear(bio)
    await userEvent.type(bio, 'New bio')
    await userEvent.click(screen.getByRole('button', { name: 'Public' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent).toMatchObject({
      username: 'emmacooks',
      bio: 'New bio',
      defaultRecipeVisibility: 'Public',
    })
    // The auth cache is patched with the new username, and we return to the menu.
    expect(renamed).toEqual(['emmacooks'])
    expect(await screen.findByText('Appearance')).toBeInTheDocument()
  })

  it('surfaces a taken username inline (409) and stays on the form', async () => {
    useProfile()
    server.use(
      http.put('*/users/me', () => HttpResponse.json({ error: 'taken' }, { status: 409 })),
    )

    renderRoute('/profile')
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: /Edit profile/ }))

    const username = await screen.findByLabelText('Username')
    await userEvent.clear(username)
    await userEvent.type(username, 'takenname')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('That username is already taken.')).toBeInTheDocument()
    // Still on the form (username field present), not back on the menu.
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.queryByText('Appearance')).not.toBeInTheDocument()
  })

  it('blocks save for a too-short username', async () => {
    useProfile()
    renderRoute('/profile')
    await openSettings()
    await userEvent.click(screen.getByRole('button', { name: /Edit profile/ }))

    const username = await screen.findByLabelText('Username')
    await userEvent.clear(username)
    await userEvent.type(username, 'ab')

    expect(await screen.findByText(/at least 3 characters/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Settings → Security (KAN-19). The one settings screen showing SERVER truth
// rather than device-local preferences: whether this account can be recovered
// at all, and the way to make it so.
// ─────────────────────────────────────────────────────────────────────────

describe('Settings — Security', () => {
  async function openSecurity() {
    renderRoute('/profile')
    await openSettings()
    await userEvent.click(await screen.findByRole('button', { name: /Security/ }))
  }

  it('shows the address as unverified and offers to prove it', async () => {
    server.use(
      http.get('*/auth/email-verification', () =>
        HttpResponse.json(makeEmailVerificationStatus({ email: 'alice@example.com' })),
      ),
    )

    await openSecurity()

    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('Not verified')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send verification email/i })).toBeInTheDocument()
  })

  it('sends a verification email and confirms it went out', async () => {
    const sent = vi.fn()
    server.use(
      http.get('*/auth/email-verification', () =>
        HttpResponse.json(makeEmailVerificationStatus({ email: 'alice@example.com' })),
      ),
      http.post('*/auth/email-verification/request', () => {
        sent()
        return new HttpResponse(null, { status: 202 })
      }),
    )

    await openSecurity()
    await userEvent.click(await screen.findByRole('button', { name: /send verification email/i }))

    expect(await screen.findByRole('button', { name: /sent — check your inbox/i })).toBeInTheDocument()
    expect(sent).toHaveBeenCalledTimes(1)
  })

  // Nothing to prove and nothing to press — asking again would be a no-op the
  // screen should not invite.
  it('shows a verified address without a send button', async () => {
    server.use(
      http.get('*/auth/email-verification', () =>
        HttpResponse.json(
          makeEmailVerificationStatus({
            email: 'alice@example.com',
            verified: true,
            verifiedAtUtc: '2026-08-01T09:00:00Z',
          }),
        ),
      ),
    )

    await openSecurity()

    expect(await screen.findByText('✓ Verified')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send verification email/i })).not.toBeInTheDocument()
  })

  it('says so plainly when the status cannot be read', async () => {
    server.use(
      http.get('*/auth/email-verification', () => new HttpResponse(null, { status: 500 })),
    )

    await openSecurity()

    expect(await screen.findByText(/could not check your email status/i)).toBeInTheDocument()
  })
})
