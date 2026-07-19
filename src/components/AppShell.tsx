import { useState } from 'react'
import { Navigate, Outlet, useLocation, useMatch, useOutletContext } from 'react-router-dom'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useAuth } from '@/auth/AuthContext'
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
  const { status } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // /recipes/new and /recipes/mine are static routes that also match the
  // :id pattern here — exclude them so only real detail pages use the canvas.
  const detailMatch = useMatch('/recipes/:id')
  const isDetail =
    !!detailMatch && detailMatch.params.id !== 'new' && detailMatch.params.id !== 'mine'

  // The redesigned Library + Feed use a wide, multi-column desktop canvas
  // (design 2a/2b), so their conversation-inner column breaks out of the
  // narrow chat-column width. Chat / profile / authoring stay in the readable
  // ~720px column. Detail keeps the library backdrop wide behind the canvas.
  const isWidePage =
    isDetail ||
    location.pathname.startsWith('/library') ||
    location.pathname.startsWith('/feed')

  // ── Auth guard ──────────────────────────────────────────────────────────
  // Every route under AppShell is protected; /login and /register render
  // outside it (under ThemeRoot). While the boot-time /auth/me check runs we
  // hold a themed placeholder; a signed-out user is bounced to /login, with
  // the attempted URL preserved so login can send them back.
  if (status === 'loading') {
    return (
      <div
        style={{
          flex: '1 1 auto',
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    )
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

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
            <div className="conversation-inner" style={isWidePage ? { maxWidth: 1240 } : undefined}>
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
