import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderRoute } from '@/test/utils'

// ─────────────────────────────────────────────────────────────────────────
// The New-recipe FAB and the chat composer were fighting over one corner.
//
// Send sits at bottom 86 (--nav-h 74 + 12 of the input bar's padding), right
// 18, 42px across. The FAB sat at bottom 88, right 16, 52px across, with
// z-index 5 and painted after the page — so it enclosed 40 of send's 42
// vertical pixels and took the tap. The reported symptom was "users think the
// + is the send button"; the cause was that the + WAS the button they could
// press, standing exactly where send should be.
//
// This is a geometry bug, so the regression test has to be about the FAB's
// existence rather than its styling: no assertion about colour or icon would
// have caught it, and none would catch it coming back.
// ─────────────────────────────────────────────────────────────────────────

describe('BottomNav — the New-recipe FAB', () => {
  it('is not rendered on the chat surface, where it covered the send button', async () => {
    renderRoute('/chat')

    await screen.findByLabelText('Message the assistant')
    expect(screen.queryByLabelText('New recipe')).not.toBeInTheDocument()
  })

  it('is still hidden inside a conversation', async () => {
    renderRoute('/chat/c0000000-0000-0000-0000-000000000001')

    await screen.findByLabelText('Message the assistant')
    expect(screen.queryByLabelText('New recipe')).not.toBeInTheDocument()
  })

  it('survives on every other tab', async () => {
    renderRoute('/discover')

    await waitFor(() => expect(screen.getByLabelText('New recipe')).toBeInTheDocument())
  })
})
