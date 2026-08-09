import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { makeAuthValue, renderRoute } from '@/test/utils'
import { AuthContext } from '@/auth/AuthContext'
import { AuthGateProvider } from '@/auth/AuthGateContext'
import ProfileSummary from '@/components/profile/ProfileSummary'

describe('ProfileSummary', () => {
  it('links the follower and following counts to the follow-list routes', async () => {
    server.use(
      http.get('*/users/:id', () =>
        HttpResponse.json(
          makeUserProfile({ id: 'author-1', username: 'chef_ana', followerCount: 5, followingCount: 2 }),
        ),
      ),
    )
    renderRoute('/users/author-1')

    expect(await screen.findByText('chef_ana')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Followers/ })).toHaveAttribute(
      'href',
      '/users/author-1/followers',
    )
    expect(screen.getByRole('link', { name: /Following/ })).toHaveAttribute(
      'href',
      '/users/author-1/following',
    )
  })
})

// `UserProfilePage` (the only caller when this suite above was written) always
// passes size="page" — so those tests give the "pane" branch (Task 7's
// preview pane, `SIZES.pane`) zero coverage. Render ProfileSummary directly,
// with no page in between, so a broken `size` prop shows up here rather than
// silently reaching Task 7. QueryClientProvider (useSocialMutations),
// AuthContext.Provider + AuthGateProvider (useAuth / useAuthGate) and a
// router (Link/useNavigate) are all required since ProfileSummary owns those
// itself — mirrors the wrapper shape FollowRow.test.tsx uses, extended for
// the extra providers this component reaches for.
function renderSummary(size: 'page' | 'pane') {
  const profile = makeUserProfile({ id: 'author-1', username: 'chef_ana' })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={makeAuthValue()}>
        <AuthGateProvider>
          <MemoryRouter>
            <ProfileSummary profile={profile} size={size} />
          </MemoryRouter>
        </AuthGateProvider>
      </AuthContext.Provider>
    </QueryClientProvider>,
  )
}

describe('ProfileSummary — size prop', () => {
  it('renders the username at the larger "page" font size', () => {
    renderSummary('page')
    expect(screen.getByText('chef_ana')).toHaveStyle({ fontSize: '22px' })
  })

  it('renders the username at the smaller "pane" font size', () => {
    renderSummary('pane')
    expect(screen.getByText('chef_ana')).toHaveStyle({ fontSize: '15px' })
  })
})
