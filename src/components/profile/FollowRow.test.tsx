import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import FollowRow from '@/components/profile/FollowRow'
import { makeFollowUser } from '@/test/msw/handlers'

// The role queries below are unambiguous only because the row's select
// control and the follow control are siblings, not nested. With the row as
// an outer <button>, its name-from-content would absorb the follow
// control's text, so getByRole('button', { name: /Following/ }) would match
// two elements. If a query here goes ambiguous again, the structure has
// regressed — do not paper over it with getByText.

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

  it('unfollows from a followed row', async () => {
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

    await userEvent.click(screen.getByRole('button', { name: '✓ Following' }))

    // The false direction, so an implementation that hard-codes `true` fails here.
    expect(onToggleFollow).toHaveBeenCalledWith(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('says "1 recipe", not "1 recipes"', () => {
    render(
      <MemoryRouter>
        <FollowRow user={makeFollowUser({ recipeCount: 1 })} onSelect={vi.fn()} onToggleFollow={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByText('1 recipe')).toBeInTheDocument()
  })
})
