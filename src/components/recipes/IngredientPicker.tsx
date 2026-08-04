// ─────────────────────────────────────────────────────────────────────────
// The ingredient picker (stream G, slice G3). Replaces IngredientNameField.
//
// THE PROPERTY THAT SURVIVES THE REPLACEMENT: this is still a plain text
// input, and anything can still be typed into it. That is decision D8 —
// "resolve, don't constrain" — and it is the reason this is not the select
// that Unit became one card above. A brand-new ingredient must always be
// enterable, for a user typing "gochujang" and for a generator inventing one.
//
// WHAT CHANGES is what the suggestions MEAN. The old field offered names
// other people had already typed, drawn from the recipe corpus; a suggestion
// was a hint that the spelling was popular. These suggestions come from the
// catalogue the WRITE path resolves against, so picking one is a promise: the
// saved recipe carries that ingredient's id, and the shopping list can then
// add it up by weight and volume together.
//
// The resolved/unresolved state is shown, and showing it is the point. The
// old field could not — there was nothing to be resolved TO — so a user had
// no way to know whether "chicken breasts" would group with "chicken breast".
// A dot and a label make the difference visible at authoring time, which is
// the only moment it is cheap to fix.
//
// Integrates with react-hook-form via its own register(...) return, exactly
// like the field it replaces: the input stays UNCONTROLLED so RHF/zod
// validation and the server-error field mapping are untouched.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { searchIngredients, type IngredientResponse } from '@/api/ingredients'
import TextField from '@/components/ui/TextField'

const DEBOUNCE_MS = 250

interface IngredientPickerProps {
  label: string
  /** react-hook-form's `register('ingredients.N.name')` return for this field. */
  registration: UseFormRegisterReturn
  /** The name currently in the field, for the resolved-state readout. */
  value: string
  error?: string
  'aria-label'?: string
  autoFocus?: boolean
}

export function IngredientPicker({
  label,
  registration,
  value,
  error,
  autoFocus,
  ...rest
}: IngredientPickerProps) {
  const listId = useId()
  const [options, setOptions] = useState<IngredientResponse[]>([])
  const [match, setMatch] = useState<IngredientResponse | null>(null)
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

  const lookup = (term: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      searchIngredients(term, controller.signal)
        .then((response) => {
          setOptions(response.items)
          // The catalogue's exact-alias hit sorts FIRST (the backend orders it
          // that way), so the head of the list is what the resolver would pick
          // for this name. Compared case-insensitively because IngredientKey
          // folds case before the server ever looks anything up.
          const head = response.items[0]
          setMatch(
            head && head.name.toLowerCase() === term.trim().toLowerCase() ? head : null,
          )
        })
        .catch(() => {
          // Best-effort, exactly as before: a failed lookup must never block
          // typing a brand-new ingredient, so a rejected/aborted fetch is
          // silently dropped and the field carries on as plain text.
        })
    }, DEBOUNCE_MS)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    // RHF's own onChange runs first and unconditionally — suggestions are a
    // side effect layered on top, never a gate on what gets typed.
    void registration.onChange(event)
    setMatch(null)
    lookup(event.target.value)
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
      {/* A <datalist>, still: it SUGGESTS without constraining. A <select>
          here would break D8 outright. */}
      <datalist id={listId}>
        {options.map((ingredient) => (
          <option key={ingredient.id} value={ingredient.name} />
        ))}
      </datalist>

      {value.trim().length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginTop: -6,
            marginBottom: 8,
            fontSize: 11.5,
            color: 'var(--muted)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              flexShrink: 0,
              background: match ? 'var(--accent)' : 'var(--border)',
            }}
          />
          {/* Phrased so the unmatched case does not read as an error, because
              it is not one — an unresolved ingredient saves exactly like any
              other, it just cannot be summed across units. */}
          {match ? `Matched ${match.name}` : 'Not in the catalogue — saves as typed'}
        </div>
      )}
    </>
  )
}
