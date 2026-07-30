// ─────────────────────────────────────────────────────────────────────────
// Ingredient-name autocomplete (task-10, meal-planning-week-shopping-rework).
//
// Wraps the existing TextField in a <datalist> of suggestions drawn from
// GET /ingredients/names. It stays a PLAIN TEXT INPUT throughout — a
// <datalist> only SUGGESTS, it never constrains what can be typed, so a
// brand-new ingredient is always enterable (a <select> would not allow
// this, which is why this isn't one). The query is debounced so typing
// doesn't fire a request per keystroke.
//
// This does not repair any ingredient name already on a recipe — it only
// slows the corpus from diverging further, so the shopping list's exact-key
// grouping (IngredientKey) gets better over time instead of worse.
//
// Integrates with react-hook-form via its own `register(...)` return value
// (passed in as `registration`) rather than local state: the input stays
// UNCONTROLLED exactly like every other field in RecipeFormPage.shared.tsx,
// so RHF/zod validation and the server-error field mapping are untouched.
// The only addition is intercepting onChange to schedule the debounced
// lookup — RHF's own onChange always still runs, first.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { getIngredientNames } from '@/api/recipes'
import TextField from '@/components/ui/TextField'

const DEFAULT_DEBOUNCE_MS = 300

export interface IngredientNameFieldProps {
  label: string
  /** react-hook-form's `register('ingredients.N.name')` return for this field. */
  registration: UseFormRegisterReturn
  error?: string
  'aria-label'?: string
  autoFocus?: boolean
  /** Overridable for tests only — production always uses the 300ms default. */
  debounceMs?: number
}

export function IngredientNameField({
  label,
  registration,
  error,
  autoFocus,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  ...rest
}: IngredientNameFieldProps) {
  const listId = useId()
  const [options, setOptions] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Cancel any pending debounce/in-flight lookup on unmount (e.g. the row was
  // removed) so a late response can never call setState on an unmounted field.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    // RHF's own onChange runs first and unconditionally — suggestions are a
    // side effect layered on top, never a gate on what gets typed or on zod
    // validation.
    void registration.onChange(event)

    const value = event.target.value
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      getIngredientNames(value.trim(), controller.signal)
        .then(setOptions)
        .catch(() => {
          // Best-effort: a failed suggestion lookup must never block typing a
          // brand-new ingredient, so a rejected/aborted fetch is silently dropped.
        })
    }, debounceMs)
  }

  return (
    <>
      <TextField
        label={label}
        error={error}
        autoFocus={autoFocus}
        list={listId}
        autoComplete="off"
        name={registration.name}
        onBlur={registration.onBlur}
        ref={registration.ref}
        onChange={handleChange}
        {...rest}
      />
      <datalist id={listId}>
        {options.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  )
}
