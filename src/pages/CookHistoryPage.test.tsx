import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRoute } from '@/test/utils'
import * as cookLogApi from '@/api/cookLog'
import type { CookLogEntry } from '@/api/cookLog'

function cook(overrides: Partial<CookLogEntry> = {}): CookLogEntry {
  return {
    id: 'c1',
    recipeId: 'r-pide',
    recipeTitle: 'Pide with minced lamb',
    recipeImageUrl: null,
    mealPlanEntryId: null,
    cookedAt: '2026-08-07T19:00:00.000Z',
    note: null,
    recipeAvailable: true,
    ...overrides,
  }
}

describe('/plan/cooks', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists cooks with their notes', async () => {
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({
      items: [cook({ note: 'dough needs a longer rest' })],
      nextCursor: null,
    })

    renderRoute('/plan/cooks')

    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByText('“dough needs a longer rest”')).toBeInTheDocument()
  })

  it('keeps an unavailable recipe’s cook readable, but not clickable', async () => {
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({
      items: [cook({ recipeAvailable: false })],
      nextCursor: null,
    })

    renderRoute('/plan/cooks')

    // The snapshotted title is the whole reason that column exists: an author
    // withdrawing a recipe must not withdraw YOUR record of having cooked it.
    expect(await screen.findByText('Pide with minced lamb')).toBeInTheDocument()
    expect(screen.getByText('unavailable')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Pide/ })).not.toBeInTheDocument()
  })

  it('never names why a recipe went away', async () => {
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({
      items: [cook({ recipeAvailable: false })],
      nextCursor: null,
    })

    renderRoute('/plan/cooks')

    await screen.findByText('Pide with minced lamb')

    // Unavailable is ONE state (design D14). The server deliberately sends a single
    // flag for "removed" and "no longer shared with you", so any copy here that
    // picks one of them is either a guess or — worse, when it guesses right —
    // reporting an author's private visibility decision to a stranger, which
    // ADR-0001 calls out as the leak itself.
    expect(screen.queryByText(/deleted|removed|private|hidden|unshared/i)).not.toBeInTheDocument()
  })

  it('links a cook whose recipe still exists', async () => {
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({
      items: [cook()],
      nextCursor: null,
    })

    renderRoute('/plan/cooks')

    expect(await screen.findByRole('link', { name: /Pide/ })).toHaveAttribute(
      'href',
      '/recipes/r-pide',
    )
  })

  it('pages through older cooks', async () => {
    const getCookLog = vi
      .spyOn(cookLogApi, 'getCookLog')
      .mockResolvedValueOnce({ items: [cook()], nextCursor: 'cursor-2' })
      .mockResolvedValueOnce({
        items: [cook({ id: 'c2', recipeId: 'r-stew', recipeTitle: 'Beef stew' })],
        nextCursor: null,
      })

    renderRoute('/plan/cooks')

    await userEvent.click(await screen.findByRole('button', { name: 'Show older cooks' }))

    expect(await screen.findByText('Beef stew')).toBeInTheDocument()
    expect(getCookLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
    )
  })

  it('says so when nothing has been cooked', async () => {
    vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({ items: [], nextCursor: null })

    renderRoute('/plan/cooks')

    expect(await screen.findByText('Nothing cooked yet')).toBeInTheDocument()
  })
})
