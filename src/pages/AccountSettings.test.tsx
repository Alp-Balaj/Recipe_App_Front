// ─────────────────────────────────────────────────────────────────────────
// Account settings (design 3e/3f) — the Settings menu's Account + Support rows
// and the real Edit profile form behind PUT /users/me. jsdom's matchMedia stub
// reports matches:false, so these run against the mobile profile layout.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
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
