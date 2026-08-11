import { lazy, Suspense, type ComponentType, type ReactElement } from 'react'

/**
 * Route-level code splitting (stream F, frontend sweep, Task 2).
 *
 * Every page module is declared lazily HERE, once, and both places that render pages
 * import from this file: `router.tsx` (the route tree) and `AppShell.tsx` (the desktop
 * canvas backdrop). That single declaration site is not tidiness — it is what makes the
 * splitting work at all. Rollup will not move a module into its own chunk if anything
 * still imports it statically, so while AppShell held `import BrowsePage from
 * '@/pages/BrowsePage'`, the router's `lazy(() => import('./pages/BrowsePage'))` was
 * silently a no-op and Vite said so:
 *
 *     BrowsePage.tsx is dynamically imported by router.tsx but also statically imported
 *     by AppShell.tsx, dynamic import will not move module into another chunk.
 *
 * Seven of the sixteen pages were in exactly that state. Sharing one `lazy()` per page
 * also means the two renderers resolve the same module and the same chunk — a second
 * `lazy()` over the same import would work, but would hand React two different component
 * identities for one page and remount it when the desktop layout swaps a page between the
 * outlet and the backdrop.
 *
 * NOT split, deliberately: `ThemeRoot` and `AppShell` themselves. They are the layout —
 * they render on every navigation, so a chunk for them saves nothing on any real page and
 * costs a waterfall, since it would have to arrive before the page's request could start.
 */

export const LoginPage = lazy(() => import('./pages/LoginPage'))
export const RegisterPage = lazy(() => import('./pages/RegisterPage'))
export const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
export const ChatPage = lazy(() => import('./pages/ChatPage'))
export const FeedPage = lazy(() => import('./pages/FeedPage'))
export const BrowsePage = lazy(() => import('./pages/BrowsePage'))
export const ProfilePage = lazy(() => import('./pages/ProfilePage'))
export const RecipeFormPage = lazy(() => import('./pages/RecipeFormPage'))
export const RecipeImportPage = lazy(() => import('./pages/RecipeImportPage'))
export const MyRecipesPage = lazy(() => import('./pages/MyRecipesPage'))
export const RecipeDetailPage = lazy(() => import('./pages/RecipeDetailPage'))
export const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))
// desktop follow list plan — the follow list as a real page, one chunk for
// both /users/:id/followers and /users/:id/following (the component derives
// its kind from the pathname; see router.tsx for the route registration).
export const FollowListPage = lazy(() => import('./pages/FollowListPage'))
export const MealPlanWeekPage = lazy(() => import('./pages/MealPlanWeekPage'))
export const MealPlanMonthPage = lazy(() => import('./pages/MealPlanMonthPage'))
// plan-page redesign — /plan's new body (hero, week strip, calorie ribbon,
// rating prompt) and the cook history behind its "All N cooks ›" link.
// MealPlanPage renders MealPlanMonthPage for ?m= and below 1024px, and imports
// it FROM HERE so the calendar keeps its own chunk.
export const MealPlanPage = lazy(() => import('./pages/MealPlanPage'))
export const CookHistoryPage = lazy(() => import('./pages/CookHistoryPage'))
// Cooked (KAN-4) — the dish list. Beside CookHistoryPage rather than replacing
// it: /plan/cooks is the same cooking in time order and stays.
export const CookedPage = lazy(() => import('./pages/CookedPage'))
export const MealPlanDayPage = lazy(() => import('./pages/MealPlanDayPage'))
export const ShoppingListPage = lazy(() => import('./pages/ShoppingListPage'))
export const FoodScanPage = lazy(() => import('./pages/FoodScanPage'))
export const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))

// Admin Rework (stream W0-FE, Task 6) — the old single-page AdminPage chunk
// is replaced by the tabbed admin section: one lazy chunk for the layout
// (role gate + tab strip) and one per tab/detail page, so a non-admin still
// never downloads any of it and each Wave-1 stream's rewrite of its own tab
// stays its own chunk.
export const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
export const AdminDashboardTab = lazy(() => import('./pages/admin/AdminDashboardTab'))
export const AdminReportsTab = lazy(() => import('./pages/admin/AdminReportsTab'))
export const AdminUsersTab = lazy(() => import('./pages/admin/AdminUsersTab'))
export const AdminUserDetailPage = lazy(() => import('./pages/admin/AdminUserDetailPage'))
export const AdminRecipePage = lazy(() => import('./pages/admin/AdminRecipePage'))
export const AdminEventsTab = lazy(() => import('./pages/admin/AdminEventsTab'))

/**
 * What a route shows while its chunk is in flight.
 *
 * Deliberately blank rather than a spinner: on a warm cache a chunk resolves in a frame or
 * two, and a spinner that flashes for 30ms reads as a glitch rather than as progress. The
 * shell chrome is already painted around it (the boundary is per-page — see `page`), so a
 * slow navigation looks like the panel filling in a beat late, not like the app vanishing.
 * It fills the same absolutely-positioned frame the tab pages use, so nothing reflows when
 * the real page replaces it.
 */
function PageFallback() {
  return <div aria-busy="true" style={{ position: 'absolute', inset: 0 }} />
}

/**
 * Wrap a lazy page in its own Suspense boundary.
 *
 * The boundary sits at the PAGE, never above `ThemeRoot` or `AppShell`, and that placement
 * is the whole design. One boundary higher up would unmount the layout on every
 * navigation: the frame would blink, and `ThemeRoot`'s `mode` — plain `useState` — would
 * reset to light, so a dark-mode reader would strobe on every click. Per page, the sidebar
 * and bottom nav stay mounted and only the panel they surround waits.
 *
 * Returns a `ReactElement`, so a route object keeps exactly the shape it had before —
 * `{ path, element }`, nothing nested, nothing added. That is what keeps this a change of
 * import strategy rather than a change to the route contract.
 */
export function page(Page: ComponentType): ReactElement {
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  )
}
