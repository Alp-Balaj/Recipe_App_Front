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
  AdminLayout,
  AdminDashboardTab,
  AdminReportsTab,
  AdminUsersTab,
  AdminUserDetailPage,
  AdminRecipePage,
  AdminEventsTab,
  BrowsePage,
  ChatPage,
  CookedPage,
  CookedDishPage,
  CookHistoryPage,
  FeedPage,
  FollowListPage,
  FoodScanPage,
  ForgotPasswordPage,
  LoginPage,
  MealPlanDayPage,
  // MealPlanMonthPage is no longer imported here: /plan points at MealPlanPage,
  // which renders the calendar itself for ?m= and below 1024px. The lazy
  // declaration stays in routeChunks, which is where that page now loads from.
  MealPlanPage,
  MealPlanWeekPage,
  MyRecipesPage,
  NotificationsPage,
  OnboardingPage,
  ProfilePage,
  RecipeDetailPage,
  RecipeFormPage,
  RecipeImportPage,
  RegisterPage,
  ResetPasswordPage,
  ResetSecondFactorPage,
  ShoppingListPage,
  UserProfilePage,
  VerifyEmailPage,
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
      // KAN-19 (account recovery) — SANCTIONED ADDITIVE route registration,
      // same discipline as /welcome above: three NEW paths pointing at three
      // NEW pages, nothing existing changed or reordered. They sit OUTSIDE
      // AppShell beside the other auth screens for the reason that decides
      // the whole feature — every one of them must work for someone who is
      // SIGNED OUT. A verification link is clicked from a mail client and a
      // password reset is, by definition, reached without the access a
      // session represents; inside the shell they would be gated by exactly
      // the thing the user has lost.
      { path: '/verify-email', element: page(VerifyEmailPage) },
      { path: '/forgot-password', element: page(ForgotPasswordPage) },
      { path: '/reset-password', element: page(ResetPasswordPage) },
      // KAN-21 (the second factor) — SANCTIONED ADDITIVE route registration,
      // same discipline as KAN-19's three above and for the same reason,
      // stated more sharply: somebody who has lost their authenticator cannot
      // finish a sign-in at all, so this page has to work with no session
      // whatsoever. Inside AppShell it would be gated by precisely the thing
      // it exists to help them get past. ONE path for both halves of the flow
      // (ask for the link, and spend it), keyed off `?token=` exactly as
      // /reset-password is.
      { path: '/reset-second-factor', element: page(ResetSecondFactorPage) },
      {
        element: <AppShell />,
        children: [
          // social-feed cp05+cp06 — SANCTIONED ADDITIVE EDIT: the social-feed
          // plan adds routes additively ("routes are additive — the frozen-
          // router discipline holds"); /feed is cp05's, /users/:id is cp06's.
          { path: '/feed', element: page(FeedPage) },
          { path: '/users/:id', element: page(UserProfilePage) },
          // desktop follow list plan — SANCTIONED ADDITIVE route registration, same
          // discipline as the social-feed routes above: two NEW paths pointing at a NEW
          // page, nothing existing changed or reordered. Three segments each, so neither
          // can shadow the two-segment /users/:id above. Both point at the same component,
          // which reads its kind off the pathname.
          { path: '/users/:id/followers', element: page(FollowListPage) },
          { path: '/users/:id/following', element: page(FollowListPage) },
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
          // plan-page redesign (external handoff, 2026-08-10) — ELEMENT ONLY,
          // the same kind of change the week board made at its own path. /plan
          // is now the planning front door: hero, week strip, calorie ribbon,
          // rating prompt. The month calendar is not gone — MealPlanPage still
          // renders MealPlanMonthPage for ?m=YYYY-MM and below 1024px, so every
          // URL that used to work still does. No route added or reordered here.
          { path: '/plan', element: page(MealPlanPage) },
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
          // plan-page redesign — SANCTIONED ADDITIVE route registration, same
          // discipline as the additive routes above: a NEW path pointing at a
          // NEW page, nothing existing changed or reordered. Two segments, but
          // it is declared BEFORE /plan/:date and "cooks" is not a valid plan
          // date, so neither shadows the other.
          { path: '/plan/cooks', element: page(CookHistoryPage) },
          { path: '/plan/:date', element: page(MealPlanDayPage) },
          // Cooked (KAN-4) — SANCTIONED ADDITIVE route registration, exactly
          // how /plan/cooks landed: a NEW path pointing at a NEW page, nothing
          // existing changed or reordered. Deliberately NOT under /plan — the
          // dish collection is not a planning surface, it is reached from the
          // Profile tab and from a link on /plan. Not in navItems.ts either:
          // the bottom bar is full, and the nav restructure that would free a
          // slot for it is a separate piece of work.
          //
          // KAN-9 — REVIEWED EDIT, the same kind /admin's tab subtree landed as
          // (2026-08-09): /cooked/:recipeId becomes a CHILD of /cooked rather
          // than its sibling. No path is added, removed, renamed or reordered —
          // both URLs are exactly the ones KAN-4 and KAN-5 registered, and both
          // still render exactly the pages they did. Only the nesting changes.
          //
          // It is nesting and not composition because of what a wide window
          // needs: the dish list and the selected dish side by side, with no
          // navigation between them. As siblings, selecting a dish would swap
          // one page component for another and REMOUNT the list — losing the
          // reader's search and their place in it on every click — and the
          // two-pane view would have to be built twice, once in each page.
          // Nested, CookedPage is the surface, the list is mounted once, and
          // the child renders either in the pane beside it (wide) or alone
          // (phone, unchanged: still its own screen, still its own back
          // gesture — see design D9).
          {
            path: '/cooked',
            element: page(CookedPage),
            children: [{ path: ':recipeId', element: page(CookedDishPage) }],
          },
          { path: '/shopping-list', element: page(ShoppingListPage) },
          // Stream N (food scanner) — SANCTIONED ADDITIVE route registration,
          // same discipline as the additive routes above. Not in navItems.ts:
          // the tab bar is full, so the scanner is reached from the shopping
          // list's "scan a receipt" entry and by URL.
          { path: '/scan', element: page(FoodScanPage) },
          // stream D (governor) — SANCTIONED ADDITIVE route, same discipline as
          // the additive routes above. Role-gated INSIDE AdminLayout (non-admins
          // get a full-page denial); the server enforces the real boundary.
          //
          // Admin Rework (stream W0-FE, Task 6) — REVIEWED EDIT: the single
          // /admin route becomes a layout with nested tab routes. Not an
          // additive route in the frozen-router sense (the path itself isn't
          // new), so it lands as its own commit per that rule; every child
          // path is new (reports/users/users:id/recipes:id/events) and none
          // reorders or removes anything else in this array.
          {
            path: '/admin',
            element: page(AdminLayout),
            children: [
              { index: true, element: page(AdminDashboardTab) },
              { path: 'reports', element: page(AdminReportsTab) },
              { path: 'users', element: page(AdminUsersTab) },
              { path: 'users/:id', element: page(AdminUserDetailPage) },
              { path: 'recipes/:id', element: page(AdminRecipePage) },
              { path: 'events', element: page(AdminEventsTab) },
            ],
          },
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
