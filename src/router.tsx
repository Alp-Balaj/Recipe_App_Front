import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import ThemeRoot from './components/ThemeRoot'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ChatPage from './pages/ChatPage'
import FeedPage from './pages/FeedPage'
import BrowsePage from './pages/BrowsePage'
import ProfilePage from './pages/ProfilePage'
import RecipeFormPage from './pages/RecipeFormPage'
import MyRecipesPage from './pages/MyRecipesPage'
import RecipeDetailPage from './pages/RecipeDetailPage'
import UserProfilePage from './pages/UserProfilePage'
import MealPlanWeekPage from './pages/MealPlanWeekPage'
import MealPlanMonthPage from './pages/MealPlanMonthPage'
import MealPlanDayPage from './pages/MealPlanDayPage'
import ShoppingListPage from './pages/ShoppingListPage'
import AdminPage from './pages/AdminPage'
import NotificationsPage from './pages/NotificationsPage'

/**
 * The ONE route-registration file (frozen after checkpoint 01).
 * Every route below points at a page file under src/pages/ — later checkpoints
 * fill in those page files without ever touching this one. Static segments
 * (/recipes/new, /recipes/mine) outrank the /recipes/:id param route.
 *
 * Exported as a plain route tree so tests can mount it with createMemoryRouter.
 */
export const routes: RouteObject[] = [
  {
    element: <ThemeRoot />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      {
        element: <AppShell />,
        children: [
          // social-feed cp05+cp06 — SANCTIONED ADDITIVE EDIT: the social-feed
          // plan adds routes additively ("routes are additive — the frozen-
          // router discipline holds"); /feed is cp05's, /users/:id is cp06's.
          { path: '/feed', element: <FeedPage /> },
          { path: '/users/:id', element: <UserProfilePage /> },
          // chat-ai v3 — SANCTIONED ADDITIVE route (same discipline as the
          // social-feed additive routes above): /chat is the new-conversation
          // surface, /chat/:conversationId deep-links one thread.
          { path: '/chat', element: <ChatPage /> },
          { path: '/chat/:conversationId', element: <ChatPage /> },
          { path: '/discover', element: <BrowsePage /> },
          // meal-planning-ui plan — SANCTIONED ADDITIVE route registration, same
          // discipline as the social-feed and chat-ai additive routes above.
          // Deliberately NOT in navItems.ts until the surface is complete.
          // meal-plan redesign — the plan's three zooms. /plan is the month
          // calendar (the front door), /plan/:date one day, /plan/week/:start
          // the 7×3 board that used to own /plan. The board keeps working and
          // can now show ANY week, which is the bug this rehoming fixes.
          // Segment counts differ, so none of these three can shadow another.
          { path: '/plan', element: <MealPlanMonthPage /> },
          // REVIEWED REMOVAL (2026-07-30): the static /plan/week redirect route
          // (week/shopping rework Task 9) existed only so the Plan tab could
          // point at a fixed path and still land on the CURRENT week. The tab
          // now lands on /plan (the month) instead, so nothing pointed at it.
          // Its PlanWeekIndex page is deleted. Note the fall-through: /plan/week
          // is two segments, so it now matches /plan/:date below and renders the
          // day page's invalid-date state — an acceptable end for a dead URL.
          // week/shopping rework (2026-07-29 design), Task 8 — ELEMENT ONLY: the
          // days-as-rows board replaces the old 7×3 editor at the same path. No
          // route added, removed or reordered.
          { path: '/plan/week/:start', element: <MealPlanWeekPage /> },
          { path: '/plan/:date', element: <MealPlanDayPage /> },
          { path: '/shopping-list', element: <ShoppingListPage /> },
          // stream D (governor) — SANCTIONED ADDITIVE route, same discipline as
          // the additive routes above. Role-gated INSIDE AdminPage (non-admins
          // get a full-page denial); the server enforces the real boundary.
          { path: '/admin', element: <AdminPage /> },
          // open-loops slice 3 — SANCTIONED ADDITIVE route registration, same
          // discipline as the social-feed, chat-ai and meal-planning additive
          // routes above. Deliberately NOT in navItems.ts: six tabs is already
          // as many as the mobile bottom bar holds, so notifications are reached
          // through the bell in the shell chrome instead of a seventh tab.
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/recipes/new', element: <RecipeFormPage /> },
          { path: '/recipes/mine', element: <MyRecipesPage /> },
          { path: '/recipes/:id', element: <RecipeDetailPage /> },
          { path: '/', element: <Navigate to="/discover" replace /> },
          { path: '*', element: <Navigate to="/discover" replace /> },
        ],
      },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
