// ─────────────────────────────────────────────────────────────────────────
// FiltersSheet — the two shapes it takes.
//
// BrowsePage.test.tsx already covers what the sheet DOES (drafting, the count
// on the trigger, filters reaching the query), and it runs entirely in the
// mobile branch because setup.ts stubs matchMedia to `matches: false`.
//
// This file covers the thing that stub hides: the desktop branch. It used to
// be Modal's "center" variant — a 380px card whatever the viewport — and is now
// an anchored, undimmed panel. The assertions are deliberately about the
// container's geometry rather than a snapshot: the bug being fixed WAS the
// geometry.
// ─────────────────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FiltersSheet, { VISIBLE_TAGS, VISIBLE_TAGS_DESKTOP } from './FiltersSheet'
import { TAGS } from '@/api/vocabulary'

const realMatchMedia = window.matchMedia

/** Point useMediaQuery's `(min-width: 1024px)` at the branch under test. */
function setDesktop(isDesktop: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('1024') ? isDesktop : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = realMatchMedia
})

function renderSheet(overrides: Partial<Parameters<typeof FiltersSheet>[0]> = {}) {
  const onApply = vi.fn()
  const onClose = vi.fn()
  render(
    <FiltersSheet
      cuisine=""
      difficulty={undefined}
      tags={[]}
      tagRanking={TAGS}
      onApply={onApply}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onApply, onClose }
}

describe('FiltersSheet — desktop', () => {
  it('hangs an anchored panel off the trigger instead of a 380px centred card', async () => {
    setDesktop(true)
    renderSheet()

    const dialog = await screen.findByRole('dialog', { name: 'Filters' })

    // The regression this replaces: Modal's "center" variant caps at 380px, so
    // the panel was phone-width on a 1440px page.
    expect(dialog.style.maxWidth).not.toBe('380px')
    expect(dialog.style.width).toBe('620px')
    expect(dialog.style.position).toBe('absolute')
    expect(dialog.style.top).toBe('81px')
    expect(dialog.style.right).toBe('34px')
  })

  it('leaves the results visible — the backdrop is not dimmed', async () => {
    setDesktop(true)
    renderSheet()

    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    const backdrop = dialog.parentElement as HTMLElement

    // "center"/"bottom" paint var(--backdrop) over the page. An anchored panel
    // must not: you are filtering results you need to keep seeing.
    expect(backdrop.style.background).toBe('')
    expect(backdrop.style.backdropFilter).toBe('')
  })

  it('still closes on an outside click, despite having no visible backdrop', async () => {
    setDesktop(true)
    const { onClose } = renderSheet()
    const user = userEvent.setup()

    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    await user.click(dialog.parentElement as HTMLElement)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('shows more tags up front, because the panel has the width for them', async () => {
    setDesktop(true)
    renderSheet()

    await screen.findByRole('dialog', { name: 'Filters' })
    const chips = screen.getAllByRole('button', { name: /^Filter by tag / })

    expect(chips).toHaveLength(VISIBLE_TAGS_DESKTOP)
    expect(VISIBLE_TAGS_DESKTOP).toBeGreaterThan(VISIBLE_TAGS)
    expect(
      screen.getByRole('button', { name: `+ ${TAGS.length - VISIBLE_TAGS_DESKTOP} more` }),
    ).toBeInTheDocument()
  })

  it('reports how many filters the draft holds, and commits them on Show results', async () => {
    setDesktop(true)
    const { onApply, onClose } = renderSheet()
    const user = userEvent.setup()

    await screen.findByRole('dialog', { name: 'Filters' })
    expect(screen.getByText('No filters selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Easy' }))
    const firstTag = screen.getAllByRole('button', { name: /^Filter by tag / })[0]
    const tagLabel = firstTag.textContent as string
    await user.click(firstTag)

    expect(screen.getByText('2 filters selected')).toBeInTheDocument()

    // Nothing reached the caller while drafting.
    expect(onApply).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Show results' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ cuisine: '', difficulty: 'Easy' }),
    )
    expect(onApply.mock.calls[0][0].tags).toHaveLength(1)
    expect(onClose).toHaveBeenCalled()
    expect(tagLabel).toBeTruthy()
  })

  it('counts a single filter in the singular', async () => {
    setDesktop(true)
    renderSheet({ difficulty: 'Hard' })

    await screen.findByRole('dialog', { name: 'Filters' })
    expect(screen.getByText('1 filter selected')).toBeInTheDocument()
  })
})

describe('FiltersSheet — phone', () => {
  it('stays a bottom sheet, with the drag handle and the full-width button', async () => {
    setDesktop(false)
    renderSheet()

    const dialog = await screen.findByRole('dialog', { name: 'Filters' })

    // Modal's "bottom" panel, untouched by the desktop work.
    expect(dialog.style.width).toBe('100%')
    expect(dialog.style.maxHeight).toBe('78%')
    expect(dialog.style.position).toBe('')

    // The footer row is desktop-only; the phone keeps the bare Apply button.
    expect(screen.queryByText(/filters? selected/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show results' }).style.width).toBe('100%')
  })

  it('keeps its narrower tag cut', async () => {
    setDesktop(false)
    renderSheet()

    await screen.findByRole('dialog', { name: 'Filters' })
    expect(screen.getAllByRole('button', { name: /^Filter by tag / })).toHaveLength(VISIBLE_TAGS)
  })
})
