import { useEffect, useMemo, useState } from 'react'
import {
  Outlet,
  useLocation,
  useMatch,
  useOutletContext,
  useRoutes,
  type RouteObject,
} from 'react-router-dom'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useAuth } from '@/auth/AuthContext'
import { AuthGateProvider, requiresAuth, useAuthGate } from '@/auth/AuthGateContext'
import Sidebar from './Sidebar'
import SidebarRail from './SidebarRail'
import BottomNav from './BottomNav'
import LoginModal from './LoginModal'
import { useBackdropPath } from './recipeCanvas'
import BrowsePage from '@/pages/BrowsePage'
import ChatPage from '@/pages/ChatPage'
import FeedPage from '@/pages/FeedPage'
import MealPlanDayPage from '@/pages/MealPlanDayPage'
import MyRecipesPage from '@/pages/MyRecipesPage'
import ProfilePage from '@/pages/ProfilePage'
import UserProfilePage from '@/pages/UserProfilePage'
import type { ThemeContextValue } from './ThemeRoot'

/** /plan/2026-07-29 — the day page, but not /plan or /plan/week/:start. */
const DAY_PLAN_PATH = /^\/plan\/\d{4}-\d{2}-\d{2}$/

/**
 * /plan and /plan?m=2026-08 — the month calendar, but not the week board.
 * The query has to be tolerated: a backdrop path carries its search string.
 */
const MONTH_PLAN_PATH = /^\/plan(\?|$)/

/**
 * Tabbed shell layout route: sidebar + conversation pane (+ recipe canvas) on
 * desktop, bottom tab bar on mobile/tablet. The active tab derives from the
 * URL (see navItems.ts); this component holds no navigation state of its own.
 *
 * Guest access (guest-access plan §4.2, frozen-module amendment D9): the shell
 * no longer bounces signed-out visitors to /login. `unauthenticated` is the
 * browsable guest state; only the account-only routes (requiresAuth) are gated,
 * by rendering Discover with the login modal open instead of the route's page.
 * AuthGateProvider mounts here so every surface under the shell can gate its
 * interactions via useAuthGate().
 */
export default function AppShell() {
  return (
    <AuthGateProvider>
      <AppShellContent />
    </AuthGateProvider>
  )
}

function AppShellContent() {
  const theme = useOutletContext<ThemeContextValue>()
  const { status } = useAuth()
  const { promptOpen, promptLogin } = useAuthGate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // /recipes/new and /recipes/mine are static routes that also match the
  // :id pattern here — exclude them so only real detail pages use the canvas.
  const detailMatch = useMatch('/recipes/:id')
  const isDetail =
    !!detailMatch && detailMatch.params.id !== 'new' && detailMatch.params.id !== 'mine'

  // ── The page behind the canvas ────────────────────────────────────────────
  // A detail URL replaces the outlet, so the conversation pane renders the page
  // the reader opened the recipe FROM (see recipeCanvas.ts) — a chat thread, the
  // feed, a profile — matched here as descendant routes so those pages still get
  // their :params and the theme outlet context. Anything not listed (or a deep
  // link carrying no backdrop) falls back to Discover, the old behaviour.
  const backdropPath = useBackdropPath()
  const backdropRoutes = useMemo<RouteObject[]>(
    () => [
      {
        element: <Outlet context={theme} />,
        children: [
          { path: '/feed', element: <FeedPage /> },
          { path: '/chat', element: <ChatPage /> },
          { path: '/chat/:conversationId', element: <ChatPage /> },
          { path: '/users/:id', element: <UserProfilePage /> },
          { path: '/profile', element: <ProfilePage /> },
          // A meal's "Recipe" button opens the canvas from the day page, so the
          // day has to be renderable behind it — otherwise the '*' fallback
          // below swaps the reader's day for Discover mid-plan.
          { path: '/plan/:date', element: <MealPlanDayPage /> },
          { path: '/recipes/mine', element: <MyRecipesPage /> },
          { path: '*', element: <BrowsePage /> },
        ],
      },
    ],
    [theme],
  )
  const backdrop = useRoutes(backdropRoutes, backdropPath)

  // The redesigned Discover + Feed + Profile use a wide, multi-column desktop
  // canvas (design 2a/2b/4a), so their conversation-inner column breaks out of
  // the narrow chat-column width. Chat / authoring stay in the readable ~720px
  // column. Detail keeps the Discover backdrop wide behind the canvas.
  // On a detail URL the pane shows the backdrop, so it's the BACKDROP's width
  // that matters (a chat behind the canvas stays a readable column).
  const panePath = isDetail ? backdropPath : location.pathname
  const isWidePage =
    panePath.startsWith('/discover') ||
    panePath.startsWith('/feed') ||
    panePath.startsWith('/users') ||
    panePath.startsWith('/profile') ||
    // The day page docks the recipe picker beside the meals; in the readable
    // column the two share 720px and adding a meal is cramped to the point of
    // unusable. The month calendar wants the room for a different reason: at
    // 720px its seven columns are ~82px each, too narrow for a dish name to
    // survive as a chip. The week board (week/shopping rework, Task 9) needs
    // it for a third reason: the desktop panel docks beside its seven day
    // rows, and at 720px a row wraps to two lines — the day's evidence (meals,
    // effort, calories) no longer reads on one line, which is the entire
    // point of "days as rows".
    DAY_PLAN_PATH.test(panePath) ||
    MONTH_PLAN_PATH.test(panePath) ||
    panePath.startsWith('/plan/week')

  // ── Auth gate (guest access, D9 amendment) ──────────────────────────────
  // A guest landing on an account-only route by direct URL gets Discover with
  // the login modal open (decision: no /login redirect) — the page behind the
  // prompt stays usable. Public routes render for guests as-is.
  const isGuest = status === 'unauthenticated'
  const isGatedRoute = isGuest && requiresAuth(location.pathname)
  useEffect(() => {
    if (isGatedRoute) promptLogin()
  }, [isGatedRoute, location.pathname, promptLogin])

  // While the boot-time /auth/me check runs we hold a themed placeholder.
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

  // The routed page — or, for a guest on a gated route, Discover as the page
  // behind the login prompt. Rendered as a direct child (not through the
  // outlet), BrowsePage still reads the theme from ThemeRoot's outlet context.
  const page = isGatedRoute ? <BrowsePage /> : <Outlet context={theme} />

  // ── Desktop (>=1024px): sidebar + conversation pane + recipe canvas ──
  if (isDesktop) {
    return (
      <div className="desktop-layout">
        {sidebarOpen ? (
          <Sidebar
            mode={theme.mode}
            onToggleMode={theme.toggleMode}
            onCollapse={() => setSidebarOpen(false)}
          />
        ) : (
          <SidebarRail
            mode={theme.mode}
            onToggleMode={theme.toggleMode}
            onExpand={() => setSidebarOpen(true)}
          />
        )}

        <div className="desktop-main">
          <section className="conversation-pane">
            <div className="conversation-inner" style={isWidePage ? { maxWidth: 1240 } : undefined}>
              {/* On a detail URL the outlet renders in the canvas pane instead,
                  and the page the recipe was opened from backs this pane. */}
              {isDetail ? backdrop : page}
            </div>
          </section>

          {/* Recipe canvas — only mounted on /recipes/:id. */}
          {isDetail && (
            <section className="canvas-pane">
              <Outlet context={theme} />
            </section>
          )}
        </div>

        {promptOpen && <LoginModal />}
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
        {page}
        <BottomNav />
        {promptOpen && <LoginModal />}
      </div>

      <div className="app-hint">
        Recipe app · tap a card → recipe detail · theme toggle in Profile or Chat
      </div>
    </>
  )
}
