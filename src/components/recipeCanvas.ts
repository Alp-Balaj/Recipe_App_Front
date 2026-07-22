import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Opening a recipe is a route change (/recipes/:id) but must NOT feel like
 * leaving the page you were on: a chat suggestion, a feed card or a profile
 * grid tile opens the recipe canvas while its own page stays behind it.
 *
 * The page to keep behind the canvas travels with the navigation as
 * `state.backdrop` (react-router's "background location" pattern), so it
 * survives refreshes and back/forward. `AppShell` renders it in the
 * conversation pane and the nav rails derive their active tab from it, instead
 * of both falling back to Discover the way they used to. A deep link or an
 * external entry point carries no backdrop → Discover, as before.
 */

const DEFAULT_BACKDROP = '/discover'

interface BackdropState {
  backdrop?: string
}

/** True only for real detail URLs — /recipes/new and /recipes/mine are pages. */
export function isRecipeDetailPath(pathname: string): boolean {
  const id = /^\/recipes\/([^/]+)\/?$/.exec(pathname)?.[1]
  return !!id && id !== 'new' && id !== 'mine'
}

/**
 * The page that sits behind the recipe canvas. Off a detail route that's simply
 * the current page (so `useOpenRecipe` below can capture it); on one it's the
 * page we arrived from.
 */
export function useBackdropPath(): string {
  const location = useLocation()
  if (!isRecipeDetailPath(location.pathname)) return location.pathname + location.search

  const carried = (location.state as BackdropState | null)?.backdrop
  // Guard against a detail URL backing itself (recipe → recipe hops keep the
  // ORIGINAL backdrop, because useOpenRecipe re-reads this hook).
  if (!carried || isRecipeDetailPath(carried.split('?')[0])) return DEFAULT_BACKDROP
  return carried
}

/**
 * Open a recipe without losing the page behind it. Use this everywhere a card,
 * tile or suggestion opens a recipe — a bare `navigate('/recipes/' + id)` drops
 * the backdrop and lands the reader back in Discover.
 */
export function useOpenRecipe(): (recipeId: string) => void {
  const navigate = useNavigate()
  const backdrop = useBackdropPath()
  return useCallback(
    (recipeId: string) => navigate(`/recipes/${recipeId}`, { state: { backdrop } }),
    [navigate, backdrop],
  )
}
