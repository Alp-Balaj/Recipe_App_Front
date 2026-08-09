import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { makeUserProfile } from '@/test/msw/handlers'
import { renderRoute } from '@/test/utils'

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
