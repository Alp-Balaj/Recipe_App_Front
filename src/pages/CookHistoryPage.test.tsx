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

  // KAN-14 — un-logging ONE cook. Until this, a cook that satisfied no plan slot
  // (cook mode on a recipe opened from Discover) could not be taken back at all:
  // the entry-scoped delete has no id to be given, and the only gesture wide
  // enough to reach it means "I have never cooked this" and erases the dish.
  describe('un-logging one cook', () => {
    it('removes a cook that carries no note without asking first', async () => {
      const getCookLog = vi
        .spyOn(cookLogApi, 'getCookLog')
        .mockResolvedValueOnce({ items: [cook()], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null })
      const unlogCook = vi.spyOn(cookLogApi, 'unlogCook').mockResolvedValue(undefined)

      renderRoute('/plan/cooks')

      await userEvent.click(await screen.findByRole('button', { name: /Un-log Pide/ }))

      // No dialog: a confirmation on every un-log would wreck the gesture, and
      // there is nothing here to lose that the row does not already show. Same
      // rule KAN-8 settled for the day page's tick.
      expect(unlogCook).toHaveBeenCalledWith('c1')
      expect(await screen.findByText('Nothing cooked yet')).toBeInTheDocument()
      expect(getCookLog).toHaveBeenCalledTimes(2)
    })

    it('asks first when the cook carries a note, and keeping it writes nothing', async () => {
      vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({
        items: [cook({ note: 'dough needs a longer rest' })],
        nextCursor: null,
      })
      const unlogCook = vi.spyOn(cookLogApi, 'unlogCook').mockResolvedValue(undefined)

      renderRoute('/plan/cooks')

      await userEvent.click(await screen.findByRole('button', { name: /Un-log Pide/ }))

      // The dialog names the dish AND quotes the note — KAN-8's rule that a
      // confirmation must say what would be lost, not that something would.
      const dialog = await screen.findByRole('dialog')
      expect(dialog).toHaveTextContent('dough needs a longer rest')
      expect(dialog).toHaveTextContent('Pide with minced lamb')

      await userEvent.click(screen.getByRole('button', { name: /Keep/ }))

      expect(unlogCook).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('removes the annotated cook once the loss is confirmed', async () => {
      vi.spyOn(cookLogApi, 'getCookLog')
        .mockResolvedValueOnce({
          items: [cook({ note: 'dough needs a longer rest' })],
          nextCursor: null,
        })
        .mockResolvedValue({ items: [], nextCursor: null })
      const unlogCook = vi.spyOn(cookLogApi, 'unlogCook').mockResolvedValue(undefined)

      renderRoute('/plan/cooks')

      await userEvent.click(await screen.findByRole('button', { name: /Un-log Pide/ }))
      await userEvent.click(await screen.findByRole('button', { name: /Delete the note/ }))

      expect(unlogCook).toHaveBeenCalledWith('c1')
      expect(await screen.findByText('Nothing cooked yet')).toBeInTheDocument()
    })

    it('un-logs a cook whose recipe is no longer available', async () => {
      vi.spyOn(cookLogApi, 'getCookLog')
        .mockResolvedValueOnce({ items: [cook({ recipeAvailable: false })], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null })
      const unlogCook = vi.spyOn(cookLogApi, 'unlogCook').mockResolvedValue(undefined)

      renderRoute('/plan/cooks')

      // ADR-0001 read from the destroying side: an author withdrawing their
      // recipe must not strand a record its owner can no longer take back. The
      // row keeps its snapshotted title and loses only its link.
      await userEvent.click(await screen.findByRole('button', { name: /Un-log Pide/ }))

      expect(unlogCook).toHaveBeenCalledWith('c1')
      expect(await screen.findByText('Nothing cooked yet')).toBeInTheDocument()
    })

    it('keeps the un-log control outside the recipe link', async () => {
      vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({ items: [cook()], nextCursor: null })

      renderRoute('/plan/cooks')

      // A <button> inside an <a> is invalid HTML and behaves like it: the click
      // navigates as well as firing, so the row would open the recipe on its way
      // to deleting the cook. The row's link therefore stops before the control.
      const link = await screen.findByRole('link', { name: /Pide/ })
      expect(link.querySelector('button')).toBeNull()
    })

    it('says so when the un-log fails, and keeps the cook on screen', async () => {
      vi.spyOn(cookLogApi, 'getCookLog').mockResolvedValue({ items: [cook()], nextCursor: null })
      vi.spyOn(cookLogApi, 'unlogCook').mockRejectedValue(new Error('offline'))

      renderRoute('/plan/cooks')

      await userEvent.click(await screen.findByRole('button', { name: /Un-log Pide/ }))

      // A failed delete that looks like a success is the worst answer here: the
      // user walks away believing the mis-tap is gone.
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t|could not/i)
      expect(screen.getByText('Pide with minced lamb')).toBeInTheDocument()
    })
  })
})
