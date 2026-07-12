import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import ThemeRoot from './components/ThemeRoot'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ChatPage from './pages/ChatPage'
import BrowsePage from './pages/BrowsePage'
import ProfilePage from './pages/ProfilePage'
import RecipeFormPage from './pages/RecipeFormPage'
import MyRecipesPage from './pages/MyRecipesPage'
import RecipeDetailPage from './pages/RecipeDetailPage'

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
          { path: '/chat', element: <ChatPage /> },
          { path: '/library', element: <BrowsePage /> },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/recipes/new', element: <RecipeFormPage /> },
          { path: '/recipes/mine', element: <MyRecipesPage /> },
          { path: '/recipes/:id', element: <RecipeDetailPage /> },
          { path: '/', element: <Navigate to="/library" replace /> },
          { path: '*', element: <Navigate to="/library" replace /> },
        ],
      },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
