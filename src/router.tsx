import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import ThemeRoot from './components/ThemeRoot'
import AppShell from './components/AppShell'

// stream F (frontend sweep), Task 2 — REVIEWED EDIT to this frozen file, landing as its
// own commit per the frozen-module rule. Not an additive route: no path is added, removed
// or reordered, and every route still points at the same page module it always did.
//
// What changes is HOW those modules are imported. All sixteen were static imports, so
// Vite emitted one 688 kB bundle and a visitor landing on /login downloaded the admin
// console, the meal planner, the chat surface and the recipe form to look at a password
// field. They are now declared lazily in ./routeChunks — see that file for why the
// declarations live there rather than inline here, and for why the Suspense boundary sits
// at the page rather than above the shell.
import {
  page,
  AdminPage,
  BrowsePage,
  ChatPage,
  FeedPage,
  LoginPage,
  MealPlanDayPage,
  MealPlanMonthPage,
  MealPlanWeekPage,
  MyRecipesPage,
  NotificationsPage,
  OnboardingPage,
  ProfilePage,
  RecipeDetailPage,
  RecipeFormPage,
  RecipeImportPage,
  RegisterPage,
  ShoppingListPage,
  UserProfilePage,
} from './routeChunks'

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
      { path: '/login', element: page(LoginPage) },
      { path: '/register', element: page(RegisterPage) },
      // stream K (onboarding) — SANCTIONED ADDITIVE route registration, same
      // discipline as the social-feed, chat-ai and meal-planning routes below:
      // a NEW path pointing at a NEW page, nothing existing changed or
      // reordered. It sits OUTSIDE AppShell, beside /login and /register, so
      // the post-register wizard is not framed by a tab bar that invites
      // leaving it unanswered; the page guards its own authentication.
      { path: '/welcome', element: page(OnboardingPage) },
      {
        element: <AppShell />,
        children: [
          // social-feed cp05+cp06 — SANCTIONED ADDITIVE EDIT: the social-feed
          // plan adds routes additively ("routes are additive — the frozen-
          // router discipline holds"); /feed is cp05's, /users/:id is cp06's.
          { path: '/feed', element: page(FeedPage) },
          { path: '/users/:id', element: page(UserProfilePage) },
          // chat-ai v3 — SANCTIONED ADDITIVE route (same discipline as the
          // social-feed additive routes above): /chat is the new-conversation
          // surface, /chat/:conversationId deep-links one thread.
          { path: '/chat', element: page(ChatPage) },
          { path: '/chat/:conversationId', element: page(ChatPage) },
          { path: '/discover', element: page(BrowsePage) },
          // meal-planning-ui plan — SANCTIONED ADDITIVE route registration, same
          // discipline as the social-feed and chat-ai additive routes above.
          // Deliberately NOT in navItems.ts until the surface is complete.
          // meal-plan redesign — the plan's three zooms. /plan is the month
          // calendar (the front door), /plan/:date one day, /plan/week/:start
          // the 7×3 board that used to own /plan. The board keeps working and
          // can now show ANY week, which is the bug this rehoming fixes.
          // Segment counts differ, so none of these three can shadow another.
          { path: '/plan', element: page(MealPlanMonthPage) },
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
          { path: '/plan/week/:start', element: page(MealPlanWeekPage) },
          { path: '/plan/:date', element: page(MealPlanDayPage) },
          { path: '/shopping-list', element: page(ShoppingListPage) },
          // stream D (governor) — SANCTIONED ADDITIVE route, same discipline as
          // the additive routes above. Role-gated INSIDE AdminPage (non-admins
          // get a full-page denial); the server enforces the real boundary.
          { path: '/admin', element: page(AdminPage) },
          // open-loops slice 3 — SANCTIONED ADDITIVE route registration, same
          // discipline as the social-feed, chat-ai and meal-planning additive
          // routes above. Deliberately NOT in navItems.ts: six tabs is already
          // as many as the mobile bottom bar holds, so notifications are reached
          // through the bell in the shell chrome instead of a seventh tab.
          { path: '/notifications', element: page(NotificationsPage) },
          { path: '/profile', element: page(ProfilePage) },
          { path: '/recipes/new', element: page(RecipeFormPage) },
          // Stream L. Static, so it outranks /recipes/:id below — same rule
          // /recipes/new and /recipes/mine already rely on.
          { path: '/recipes/import', element: page(RecipeImportPage) },
          { path: '/recipes/mine', element: page(MyRecipesPage) },
          { path: '/recipes/:id', element: page(RecipeDetailPage) },
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
