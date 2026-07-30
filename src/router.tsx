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
import PlanWeekIndex from './pages/PlanWeekIndex'

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
          // week/shopping rework, Task 9 — SANCTIONED ADDITIVE route: the Plan
          // tab needs a static path but must land on the CURRENT week, which
          // moves, so this resolves it and redirects. Placed before
          // /plan/week/:start so the static segment isn't shadowed by the param.
          { path: '/plan/week', element: <PlanWeekIndex /> },
          // week/shopping rework (2026-07-29 design), Task 8 — ELEMENT ONLY: the
          // days-as-rows board replaces the old 7×3 editor at the same path. No
          // route added, removed or reordered.
          { path: '/plan/week/:start', element: <MealPlanWeekPage /> },
          { path: '/plan/:date', element: <MealPlanDayPage /> },
          { path: '/shopping-list', element: <ShoppingListPage /> },
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
