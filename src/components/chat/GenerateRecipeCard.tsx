// ─────────────────────────────────────────────────────────────────────────
// "Write me a new one" — the AI recipe generator on the chat surface
// (stream E, decision D1).
//
// It lives HERE, at the foot of the thread, and not on /recipes/new, because
// this is the one place in the app where the two modes of generation sit side
// by side: everything above this card is GROUNDED (the assistant may only
// point at recipes that already exist, and hallucinated ids are dropped), and
// this card is FREE (the model invents). That contrast is the feature's whole
// argument, and putting them on one screen is what makes it visible.
//
// The result is not a preview. Per D1 the generated recipe is a real,
// user-owned, flagged row the moment it is written, so the outcome here is a
// link to an ordinary /recipes/{id} — no bespoke review surface, no second
// write path, and the owner edits or deletes it exactly like anything else
// they wrote. What the recipe does NOT get is rank: generating is worth zero
// points until somebody cooks it and rates it.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { generateRecipe, isQuotaError, type GenerateRecipeResponse } from '@/api/generation'

/** Matches the backend validator's cap so the button disables before a 400 can happen. */
const MAX_PROMPT_LENGTH = 1000

export default function GenerateRecipeCard({ conversationId }: { conversationId?: string }) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<GenerateRecipeResponse | null>(null)

  const generate = useMutation({
    mutationFn: (value: string) => generateRecipe({ prompt: value, conversationId }),
    onSuccess: async (response) => {
      setPrompt('')
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

  const trimmed = prompt.trim()
  const tooLong = trimmed.length > MAX_PROMPT_LENGTH
  const canSubmit = trimmed.length > 0 && !tooLong && !generate.isPending

  function submit() {
    if (!canSubmit) return
    setResult(null)
    generate.mutate(trimmed)
  }

  return (
    <div style={cardStyle}>
      <span style={labelStyle}>Write me a new one</span>
      <p style={lineStyle}>
        Nothing above quite right? Describe the dish and the assistant will invent a recipe
        and save it to your collection.
      </p>

      <div style={rowStyle}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="e.g. a 20-minute vegetarian noodle bowl"
          aria-label="Describe the recipe to generate"
          disabled={generate.isPending}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{ ...generateButton, opacity: canSubmit ? 1 : 0.55, cursor: canSubmit ? 'pointer' : 'default' }}
        >
          {generate.isPending ? 'Writing…' : 'Generate'}
        </button>
      </div>

      {tooLong && (
        <span role="status" style={errorText}>
          That's a long brief — keep it under {MAX_PROMPT_LENGTH} characters.
        </span>
      )}

      {generate.isError && (
        <span role="status" style={errorText}>
          {isQuotaError(generate.error)
            ? "You've used today's AI allowance. Nothing was saved — the budget resets at midnight UTC."
            : "The assistant couldn't write a usable recipe just now. Nothing was saved — try again."}
        </span>
      )}

      {result && (
        <div style={outcomeStyle}>
          <span role="status" style={successText}>
            Saved “{result.recipe.title}” to your recipes.
          </span>
          <Link to={`/recipes/${result.recipe.id}`} style={outcomeLink}>
            Open it
          </Link>
          <span style={budgetText}>
            {result.budget.callsRemaining}{' '}
            {result.budget.callsRemaining === 1 ? 'AI call' : 'AI calls'} left today
          </span>
        </div>
      )}
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 13px',
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  marginTop: 6,
}

const labelStyle: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const lineStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.4,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const inputStyle: CSSProperties = {
  flex: '1 1 200px',
  minWidth: 0,
  background: 'var(--inputbg)',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '9px 14px',
  fontSize: 13.5,
  color: 'var(--text)',
  fontFamily: 'inherit',
  outline: 'none',
}

const generateButton: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
  fontFamily: 'inherit',
  flexShrink: 0,
}

const outcomeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  flexWrap: 'wrap',
}

const errorText: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  fontWeight: 600,
}

const successText: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--accent)',
  fontWeight: 700,
}

const outcomeLink: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
}

const budgetText: CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
}
