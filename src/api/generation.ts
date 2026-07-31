// ─────────────────────────────────────────────────────────────────────────
// AI recipe generation — the wire call behind "write me a recipe" (stream E,
// decision D1).
//
// NEW module, not one of the frozen shared modules. Same precedent as
// api/mealPlans.ts / api/shopping.ts / api/reports.ts: a small file per
// feature area, wire fetchers only, through the frozen apiFetch wrapper.
//
//   POST /recipes/generate  { prompt, conversationId?, visibility? }
//     → 201 { recipe: RecipeResponse, budget: AiBudget }
//     → 400 blank or over-long prompt
//     → 404 the conversation is unknown, deleted, or someone else's
//     → 429 the caller's daily AI budget is spent (or the chat lane's IP window)
//     → 502 the generator could not write a usable recipe; nothing was saved
//
// The result is an ORDINARY recipe: user-owned, flagged with isAiGenerated,
// carrying the conversation it came from. That is what lets the UI simply route
// to /recipes/{id} afterwards instead of inventing a preview surface.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch, ApiError } from './client'
import type { RecipeResponse, Visibility } from './types'

/** The caller's remaining AI allowance for the current UTC day (stream B's accounting). */
export interface AiBudget {
  dailyCallLimit: number
  callsUsed: number
  callsRemaining: number
  dailyTokenLimit: number
  tokensUsed: number
  tokensRemaining: number
  resetsAtUtc: string
}

export interface GenerateRecipeRequest {
  /** What the user wants. Required, and capped at 1000 characters by the backend. */
  prompt: string
  /**
   * The conversation to generate from. Optional on the wire; the chat surface
   * always sends it once a thread exists, which is what records provenance AND
   * gives the generator the thread's recent messages as context.
   */
  conversationId?: string | null
  /** Omitted means "use my default recipe visibility" — resolved server-side. */
  visibility?: Visibility
}

export interface GenerateRecipeResponse {
  recipe: RecipeResponse
  budget: AiBudget
}

export function generateRecipe(
  request: GenerateRecipeRequest,
  signal?: AbortSignal,
): Promise<GenerateRecipeResponse> {
  return apiFetch<GenerateRecipeResponse>('/recipes/generate', {
    method: 'POST',
    body: request,
    signal,
  })
}

/**
 * True when a failure was "you are out of AI budget for today" rather than
 * "the generator broke". The two need different copy — one is worth retrying
 * immediately, the other is not — and both arrive as an ApiError, so the status
 * is the only thing that separates them. 429 also covers the chat lane's
 * per-IP window, which is the same advice to the user either way: not now.
 */
export function isQuotaError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429
}
