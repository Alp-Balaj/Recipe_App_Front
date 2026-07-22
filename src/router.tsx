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
