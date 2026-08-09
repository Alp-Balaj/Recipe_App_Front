import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FollowRow from '@/components/profile/FollowRow'
import { makeFollowUser } from '@/test/msw/handlers'

describe('FollowRow', () => {
  it('shows the username and recipe count', () => {
    render(
      <MemoryRouter>
        <FollowRow
          user={makeFollowUser({ username: 'mira_cooks', recipeCount: 42 })}
          onSelect={vi.fn()}
          onToggleFollow={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('mira_cooks')).toBeInTheDocument()
    expect(screen.getByText('42 recipes')).toBeInTheDocument()
  })

  it('follows without also selecting the row', async () => {
    const onSelect = vi.fn()
    const onToggleFollow = vi.fn()
    render(
      <MemoryRouter>
        <FollowRow
          user={makeFollowUser({ followedByMe: false })}
          onSelect={onSelect}
          onToggleFollow={onToggleFollow}
        />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Follow' }))

    expect(onToggleFollow).toHaveBeenCalledWith(true)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks the selected row with aria-current', () => {
    render(
      <MemoryRouter>
        <FollowRow user={makeFollowUser()} selected onSelect={vi.fn()} onToggleFollow={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: /mira_cooks/ })).toHaveAttribute('aria-current', 'true')
  })

  it('shows the following affordance for an already-followed user', () => {
    render(
      <MemoryRouter>
        <FollowRow
          user={makeFollowUser({ followedByMe: true })}
          onSelect={vi.fn()}
          onToggleFollow={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('✓ Following')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument()
  })

  it('unfollows (next=false) without also selecting the row when already followed', async () => {
    const onSelect = vi.fn()
    const onToggleFollow = vi.fn()
    render(
      <MemoryRouter>
        <FollowRow
          user={makeFollowUser({ followedByMe: true })}
          onSelect={onSelect}
          onToggleFollow={onToggleFollow}
        />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByText('✓ Following'))

    expect(onToggleFollow).toHaveBeenCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('stops propagation on keyboard activation of the follow control too', async () => {
    const onSelect = vi.fn()
    const onToggleFollow = vi.fn()
    render(
      <MemoryRouter>
        <FollowRow
          user={makeFollowUser({ followedByMe: true })}
          onSelect={onSelect}
          onToggleFollow={onToggleFollow}
        />
      </MemoryRouter>,
    )

    const followControl = screen.getByText('✓ Following')
    followControl.focus()
    await userEvent.keyboard('{Enter}')

    expect(onToggleFollow).toHaveBeenCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
