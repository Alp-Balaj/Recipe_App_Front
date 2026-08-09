// ─────────────────────────────────────────────────────────────────────────
// The generate lane's state, lifted out of the old GenerateRecipeCard.
//
// It moved because the Create tab and the Library tab now share ONE composer
// docked at the bottom of ChatPage — the card used to carry its own text field,
// which is exactly the duplication that made "am I searching or writing?"
// ambiguous. The page owns the input; this hook owns what happens to it; and
// CreatePanel renders the outcome. Nothing about the WIRE call changed: same
// endpoint, same prompt cap, same conversationId for provenance and context.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { generateRecipe, isQuotaError, type GenerateRecipeResponse } from '@/api/generation'

/** Matches the backend validator's cap so the composer disables before a 400 can happen. */
export const MAX_PROMPT_LENGTH = 1000

export interface CreateRecipeState {
  /** The brief that produced (or is producing) the current outcome — rendered as the user turn. */
  prompt: string | null
  isPending: boolean
  result: GenerateRecipeResponse | null
  isError: boolean
  /** A 429: the answer is "later", not "that didn't work". Different copy, different surface. */
  isQuotaSpent: boolean
  submit(prompt: string): void
  /** "Try another" — drop the outcome, keep the tab. */
  reset(): void
}

export function useCreateRecipe(conversationId?: string): CreateRecipeState {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateRecipeResponse | null>(null)

  const generate = useMutation({
    mutationFn: (value: string) => generateRecipe({ prompt: value, conversationId }),
    onSuccess: async (response) => {
      setResult(response)
      // A new recipe exists and it is the caller's own, so every list that can
      // show it is stale: the browse lists, /recipes/mine, and the meal-plan
      // picker's prefetched "Mine" segment.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.recipes.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.picker.all }),
      ])
    },
  })

  return {
    prompt,
    isPending: generate.isPending,
    result,
    isError: generate.isError,
    isQuotaSpent: generate.isError && isQuotaError(generate.error),
    submit(value: string) {
      const trimmed = value.trim()
      if (!trimmed || trimmed.length > MAX_PROMPT_LENGTH || generate.isPending) return
      setResult(null)
      setPrompt(trimmed)
      generate.mutate(trimmed)
    },
    reset() {
      setResult(null)
      setPrompt(null)
      generate.reset()
    },
  }
}
