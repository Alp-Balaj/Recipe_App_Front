// ─────────────────────────────────────────────────────────────────────────
// The cook-mode assistant's one call (stream M).
//
// NEW module, not one of the frozen shared modules — same precedent as
// api/generation.ts: a small file per feature area, wire fetchers only,
// through the frozen apiFetch wrapper.
//
//   POST /recipes/{id}/cook/ask  { question, history?, servings? }
//     → 200 { answer, refused, budget }
//     → 400 blank/over-long question, a history over 20 items or with a role
//           other than "user"/"assistant", servings outside 1–100
//     → 404 the recipe is unknown, deleted, or not visible to the caller
//     → 429 the caller's daily AI budget is spent (or the chat IP window)
//     → 502 the assistant could not answer
//
// ── WHY THE HISTORY IS IN THE REQUEST (decision D14) ──────────────────────
// A cook-mode exchange is SESSION-SCOPED. There is no conversation row, no
// transcript table and no migration: the client holds the messages and hands
// them back each turn, and when the overlay closes they are gone.
//
// That is containment, not thrift. The backend's ChatService feeds a
// conversation's trailing messages into the recommender's grounding, so a
// cook-mode exchange stored as an ordinary conversation would put "can I use
// margarine instead of butter" into the prompt that decides what to suggest
// for dinner next Tuesday.
//
// The consequence for THIS side is worth stating plainly: closing cook mode
// discards the exchange, and that is the design rather than a gap to fix
// later with localStorage.
// ─────────────────────────────────────────────────────────────────────────

import { apiFetch } from './client'
import type { AiBudget } from './types'

/** One prior turn. "user" or "assistant" — the backend 400s anything else. */
export interface CookHistoryItem {
  role: 'user' | 'assistant'
  content: string
}

export interface CookQuestionRequest {
  question: string
  /** Oldest first. Omitted or empty on the first turn. */
  history?: CookHistoryItem[]
  /**
   * The serving count the cook is actually cooking for, so the assistant's
   * numbers match the screen's. The server scales the ingredient list with the
   * same arithmetic `@/lib/servingScale` runs here — never the model.
   */
  servings?: number
}

export interface CookAnswerResponse {
  answer: string
  /**
   * The model's own verdict that the question was not about this recipe. It
   * rides the wire as a FLAG rather than being inferred from the prose,
   * because a refusal you have to detect by reading is one no surface renders
   * differently and no test asserts.
   */
  refused: boolean
  budget: AiBudget
}

/** Backend CookQuestionRequestValidator: NotEmpty + MaximumLength(500). */
export const COOK_QUESTION_MAX_LENGTH = 500

/** Backend CookQuestionRequestValidator: at most 20 prior messages. */
export const COOK_HISTORY_MAX_ITEMS = 20

export function askCookAssistant(
  recipeId: string,
  request: CookQuestionRequest,
  signal?: AbortSignal,
): Promise<CookAnswerResponse> {
  return apiFetch<CookAnswerResponse>(`/recipes/${recipeId}/cook/ask`, {
    method: 'POST',
    body: request,
    signal,
  })
}
