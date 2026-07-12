import { useState } from 'react'
import { Outlet, useMatch, useOutletContext } from 'react-router-dom'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import BrowsePage from '@/pages/BrowsePage'
import type { ThemeContextValue } from './ThemeRoot'

/**
 * Tabbed shell layout route: sidebar + conversation pane (+ recipe canvas) on
 * desktop, bottom tab bar on mobile/tablet. The active tab derives from the
 * URL (see navItems.ts); this component holds no navigation state of its own.
 */
export default function AppShell() {
  const theme = useOutletContext<ThemeContextValue>()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // /recipes/new and /recipes/mine are static routes that also match the
  // :id pattern here — exclude them so only real detail pages use the canvas.
  const detailMatch = useMatch('/recipes/:id')
  const isDetail =
    !!detailMatch && detailMatch.params.id !== 'new' && detailMatch.params.id !== 'mine'

  // ── Desktop (>=1024px): sidebar + conversation pane + recipe canvas ──
  if (isDesktop) {
    return (
      <div className="desktop-layout">
        {sidebarOpen && (
          <Sidebar
            mode={theme.mode}
            onToggleMode={theme.toggleMode}
            onCollapse={() => setSidebarOpen(false)}
          />
        )}

        <div className="desktop-main">
          {!sidebarOpen && (
            <button
              className="sidebar-reopen"
              onClick={() => setSidebarOpen(true)}
              title="Show sidebar"
              aria-label="Show sidebar"
            >
              »
            </button>
          )}

          <section className="conversation-pane">
            <div className="conversation-inner">
              {/* On a detail URL the outlet renders in the canvas pane instead;
                  the library backs the conversation pane so the two-pane look
                  survives deep links and refreshes. */}
              {isDetail ? <BrowsePage /> : <Outlet context={theme} />}
            </div>
          </section>

          {/* Recipe canvas — only mounted on /recipes/:id. */}
          {isDetail && (
            <section className="canvas-pane">
              <Outlet context={theme} />
            </section>
          )}
        </div>
      </div>
    )
  }

  // ── Mobile (<768px full-bleed) & tablet (768–1023px centered column) ──
  return (
    <>
      {/* Responsive frame: full-bleed on mobile, centered column on tablet.
          Stays position:relative so the absolutely-positioned pages / nav /
          detail overlay keep working unchanged. */}
      <div className="app-frame">
        <Outlet context={theme} />
        <BottomNav />
      </div>

      <div className="app-hint">
        Recipe app · tap a card → recipe detail · theme toggle in Profile or Chat
      </div>
    </>
  )
}
