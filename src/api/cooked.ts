// ─────────────────────────────────────────────────────────────────────────
// Cooked — wire shapes + fetcher (KAN-4, design 2026-08-11-cooked-design.md).
//
// The user's private collection of the dishes they have actually made. Its unit
// is the DISH, not the cook: a recipe cooked four times is one row carrying the
// count. That is what separates it from api/cookLog.ts, which is the event
// stream behind /plan/cooks — the two answer different questions and neither is
// a filter of the other.
//
// Wire contract (backend KAN-4):
//   GET /users/me/cooked-recipes → 200 CookedDishListResponse (?cursor&limit)
//                                | 401 for a guest (the whole list is caller-scoped)
//
// Dishes the user rated but never cooked are excluded server-side (design D8) —
// rating has been able to create such rows since 30 July, and this client must
// not try to re-derive that rule from timesCooked.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'

export interface CookedDish {
  recipeId: string
  /**
   * What to call the dish. Never empty: the recipe's current title while it is
   * readable, and otherwise the title snapshotted on the most recent cook. A
   * dish with neither is omitted server-side rather than sent with a blank name.
   */
  title: string
  /** Null when the recipe has no photo, and also once it is unavailable. */
  imageUrl?: string | null
  timesCooked: number
  lastCookedAt: string
  /** 1-5, per dish and lifetime — null until the user rates it. */
  rating?: number | null
  /**
   * The most recent NON-EMPTY note left against this dish, with the date of the
   * cook it belongs to.
   *
   * The two travel as a pair (both null or both set) and the date is the
   * annotated cook's own, NOT `lastCookedAt`: a note belongs to one cook, and
   * one written three cooks ago must not be rendered as if it described last
   * night's. Show them together or show neither.
   */
  latestNote?: string | null
  latestNoteCookedAt?: string | null
  /**
   * "Can I open this recipe?" — NOT "does it still exist". Same contract as
   * CookLogEntry.recipeAvailable: false both when the author removed it and when
   * they stopped sharing it, with deliberately no second field naming which.
   * The row still renders; it just stops linking anywhere.
   */
  recipeAvailable: boolean
}

export interface CookedDishListResponse {
  items: CookedDish[]
  nextCursor?: string | null
}

/**
 * One page of the caller's dishes, most recently cooked first.
 *
 * Page on `nextCursor`, never on `items.length`: the server drops rows it cannot
 * render (a pre-August dish whose recipe is gone leaves nothing to name it), so
 * a page can legitimately come back shorter than `limit` and still have more
 * behind it.
 */
export function getCookedDishes(
  params: { cursor?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<CookedDishListResponse> {
  const { cursor, limit, signal } = params
  return apiFetch<CookedDishListResponse>('/users/me/cooked-recipes', {
    query: { cursor, limit },
    signal,
  })
}
