import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { makeAuthValue } from '@/test/utils'
import { AuthContext } from '@/auth/AuthContext'
import { AuthGateProvider } from '@/auth/AuthGateContext'
import FollowPreviewPane from '@/components/profile/FollowPreviewPane'

// FollowPreviewPane renders the shared ProfileSummary, which owns useAuth /
// useAuthGate (its follow button + own-profile branch) — so this wrapper
// mirrors the one ProfileSummary.test.tsx and FollowRow.test.tsx use rather
// than the bare QueryClientProvider + MemoryRouter the plan draft shows.
function renderPane(userId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue()}>
        <AuthGateProvider>
          <MemoryRouter>
            <FollowPreviewPane userId={userId} />
          </MemoryRouter>
        </AuthGateProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('FollowPreviewPane', () => {
  it('prompts when nothing is selected', () => {
    renderPane(null)
    expect(screen.getByText('Pick a cook')).toBeInTheDocument()
  })

  it('renders the selected cook and a link to their full profile', async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(makeUserProfile({ id: 'u9', username: 'mira_cooks' })),
      ),
    )
    renderPane('u9')

    expect(await screen.findByText('mira_cooks')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View full profile/ })).toHaveAttribute('href', '/users/u9')
  })

  it('says so when the cook no longer exists, with no retry action', async () => {
    server.use(http.get('*/users/:id', () => new HttpResponse(null, { status: 404 })))
    renderPane('gone')

    expect(await screen.findByText('This cook is no longer available')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('shows a generic error with a retry action on a non-404 failure', async () => {
    server.use(http.get('*/users/:id', () => new HttpResponse(null, { status: 500 })))
    renderPane('u9')

    expect(await screen.findByText("Couldn't load this profile")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('This cook is no longer available')).not.toBeInTheDocument()
  })
})
