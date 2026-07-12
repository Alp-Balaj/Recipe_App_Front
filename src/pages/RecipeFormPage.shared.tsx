// ─────────────────────────────────────────────────────────────────────────
// Shared authoring form — the react-hook-form + zod recipe editor reused by
// BOTH the create page (/recipes/new, checkpoint 05) and the edit overlay in
// MyRecipesPage (checkpoint 06). Owned by lane B (matches RecipeFormPage*).
//
// The form values are all strings/enums/arrays (raw <input> shapes); numeric
// conversion + tag normalization + stepNumber assignment happen once, on
// submit, in toCreateRecipeRequest. zod mirrors the backend validator so most
// 400s never leave the browser; a 400 that does get through is mapped from its
// PascalCase property paths back onto the camelCase form fields.
// ─────────────────────────────────────────────────────────────────────────

import { type ReactNode } from 'react'
import { useForm, useFieldArray, type UseFormSetError } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiValidationError } from '@/api/client'
import type { CreateRecipeRequest, RecipeResponse } from '@/api/types'
import TextField from '@/components/ui/TextField'

// ── Schema (mirrors the backend CreateRecipeRequestValidator) ───────────────

const wholeNumberRe = /^\d+$/

/** Required whole number ≥ 0 (prep/cook minutes). */
const nonNegIntField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => wholeNumberRe.test(v), `${label} must be a whole number ≥ 0`)

/** Required whole number > 0 (servings). */
const positiveIntField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((v) => wholeNumberRe.test(v) && Number(v) > 0, `${label} must be at least 1`)

const ingredientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  quantity: z
    .string()
    .trim()
    .min(1, 'Qty is required')
    .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, 'Must be greater than 0'),
  unit: z.string().trim().min(1, 'Unit is required'),
})

const stepSchema = z.object({
  description: z.string().trim().min(1, 'Describe this step'),
  // Optional per-step timer, entered in whole seconds; blank = no timer.
  timerSeconds: z
    .string()
    .trim()
    .refine((v) => v === '' || wholeNumberRe.test(v), 'Whole seconds ≥ 0'),
})

export const recipeFormSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Keep it under 200 characters'),
  description: z.string().trim().min(1, 'Description is required'),
  prepTimeMinutes: nonNegIntField('Prep time'),
  cookTimeMinutes: nonNegIntField('Cook time'),
  servings: positiveIntField('Servings'),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  visibility: z.enum(['Public', 'Private', 'FriendsOnly']),
  cuisineType: z.string().trim().max(100, 'Keep it short').optional(),
  caloriesPerServing: z
    .string()
    .trim()
    .refine((v) => v === '' || wholeNumberRe.test(v), 'Calories must be a whole number ≥ 0'),
  imageUrl: z.string().trim(),
  ingredients: z.array(ingredientSchema).min(1, 'Add at least one ingredient'),
  steps: z.array(stepSchema).min(1, 'Add at least one step'),
  tags: z.string(),
})

export type RecipeFormValues = z.infer<typeof recipeFormSchema>

// ── Defaults + conversion (form ⇆ wire) ─────────────────────────────────────

export const emptyRecipeDefaults: RecipeFormValues = {
  title: '',
  description: '',
  prepTimeMinutes: '',
  cookTimeMinutes: '',
  servings: '',
  difficulty: 'Easy',
  visibility: 'Public',
  cuisineType: '',
  caloriesPerServing: '',
  imageUrl: '',
  ingredients: [{ name: '', quantity: '', unit: '' }],
  steps: [{ description: '', timerSeconds: '' }],
  tags: '',
}

/**
 * Form values → CreateRecipeRequest wire body. stepNumber is assigned here as
 * index + 1 (never a form field); tags are trimmed, lowercased, de-duped, and
 * empties dropped; blank optionals become null.
 *
 * The PUT (update) body is structurally identical to CreateRecipeRequest, so
 * checkpoint 06 reuses this same converter for edits.
 */
export function toCreateRecipeRequest(v: RecipeFormValues): CreateRecipeRequest {
  const tags = Array.from(
    new Set(v.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)),
  )

  const cuisineType = v.cuisineType?.trim() ?? ''
  const imageUrl = v.imageUrl.trim()
  const calories = v.caloriesPerServing.trim()

  return {
    title: v.title.trim(),
    description: v.description.trim(),
    prepTimeMinutes: Number(v.prepTimeMinutes),
    cookTimeMinutes: Number(v.cookTimeMinutes),
    servings: Number(v.servings),
    difficulty: v.difficulty,
    visibility: v.visibility,
    cuisineType: cuisineType ? cuisineType : null,
    caloriesPerServing: calories ? Number(calories) : null,
    imageUrl: imageUrl ? imageUrl : null,
    ingredients: v.ingredients.map((i) => ({
      name: i.name.trim(),
      quantity: Number(i.quantity),
      unit: i.unit.trim(),
    })),
    steps: v.steps.map((s, idx) => ({
      stepNumber: idx + 1,
      description: s.description.trim(),
      timerSeconds: s.timerSeconds.trim() ? Number(s.timerSeconds) : null,
    })),
    tags,
  }
}

/** RecipeResponse → form values, for the edit overlay's prefill (checkpoint 06). */
export function recipeResponseToFormValues(r: RecipeResponse): RecipeFormValues {
  return {
    title: r.title,
    description: r.description,
    prepTimeMinutes: String(r.prepTimeMinutes),
    cookTimeMinutes: String(r.cookTimeMinutes),
    servings: String(r.servings),
    difficulty: r.difficulty,
    visibility: r.visibility,
    cuisineType: r.cuisineType ?? '',
    caloriesPerServing: r.caloriesPerServing != null ? String(r.caloriesPerServing) : '',
    imageUrl: r.imageUrl ?? '',
    ingredients: r.ingredients.length
      ? r.ingredients.map((i) => ({ name: i.name, quantity: String(i.quantity), unit: i.unit }))
      : [{ name: '', quantity: '', unit: '' }],
    steps: r.steps.length
      ? r.steps.map((s) => ({
          description: s.description,
          timerSeconds: s.timerSeconds != null ? String(s.timerSeconds) : '',
        }))
      : [{ description: '', timerSeconds: '' }],
    tags: r.tags.join(', '),
  }
}

// ── Server-error mapping (PascalCase paths → camelCase RHF field names) ──────

const KNOWN_ROOTS = new Set([
  'title',
  'description',
  'prepTimeMinutes',
  'cookTimeMinutes',
  'servings',
  'difficulty',
  'visibility',
  'cuisineType',
  'caloriesPerServing',
  'imageUrl',
  'ingredients',
  'steps',
  'tags',
])

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

/** "Ingredients[0].Name" → "ingredients.0.name"; "Title" → "title". */
export function pascalPathToFieldName(path: string): string {
  return path
    .split('.')
    .map((seg) => {
      const m = seg.match(/^([A-Za-z]+)(?:\[(\d+)\])?$/)
      if (!m) return lowerFirst(seg)
      const name = lowerFirst(m[1])
      return m[2] !== undefined ? `${name}.${m[2]}` : name
    })
    .join('.')
}

/**
 * Apply a ValidationProblem.errors dict onto the form. Recognized paths become
 * field errors; anything unmapped is returned so the caller can surface it in a
 * banner (so a stray server error is never silently swallowed).
 */
export function applyServerErrors(
  errors: Record<string, string[]>,
  setError: UseFormSetError<RecipeFormValues>,
): string[] {
  const unmapped: string[] = []
  for (const [path, messages] of Object.entries(errors)) {
    const message = messages?.[0] ?? 'Invalid value'
    const field = pascalPathToFieldName(path)
    const root = field.split('.')[0]
    if (KNOWN_ROOTS.has(root)) {
      // RHF's field-path typing can't express dynamic array paths — cast is safe.
      setError(field as keyof RecipeFormValues, { type: 'server', message })
    } else {
      unmapped.push(message)
    }
  }
  return unmapped
}

// ── Presentational bits ─────────────────────────────────────────────────────

const ERROR_COLOR = '#d9534f'

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'block',
        fontSize: 12.5,
        fontWeight: 700,
        color: 'var(--muted)',
        marginBottom: 6,
      }}
    >
      {children}
    </span>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <span role="alert" style={{ display: 'block', fontSize: 12, color: ERROR_COLOR, marginTop: 5 }}>
      {message}
    </span>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 18,
        padding: '16px 16px 6px',
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 12 }}>
      {children}
    </div>
  )
}

function smallButtonStyle(kind: 'accent' | 'ghost' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    cursor: 'pointer',
    borderRadius: 11,
    padding: '8px 12px',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 700,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--muted)',
  }
  if (kind === 'accent') return { ...base, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)' }
  if (kind === 'danger') return { ...base, color: ERROR_COLOR }
  return base
}

// ── The form itself ─────────────────────────────────────────────────────────

export interface RecipeFormProps {
  defaultValues: RecipeFormValues
  submitLabel: string
  pendingLabel: string
  /** Perform the write (POST or PUT). Resolves with the created/updated recipe. */
  submit: (body: CreateRecipeRequest) => Promise<RecipeResponse>
  /** Called after a successful write with the server's response. */
  onSuccess: (recipe: RecipeResponse) => void
  /** When provided, renders a Cancel button (used by the edit overlay). */
  onCancel?: () => void
  /** Extra fallback message shown in the banner on non-validation failures. */
  errorFallback?: string
  /**
   * Intercept a submit failure before the form's default handling. Return true
   * to signal the error was fully handled (the form then does nothing more) —
   * used by the edit overlay to route 403/404 to a page-level banner. Validation
   * (400) errors should fall through (return false/undefined) so they still map
   * onto the fields.
   */
  onError?: (err: unknown) => boolean | void
}

export function RecipeForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  submit,
  onSuccess,
  onCancel,
  errorFallback = 'Something went wrong saving your recipe. Please try again.',
  onError,
}: RecipeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RecipeFormValues>({ resolver: zodResolver(recipeFormSchema), defaultValues })

  const ingredients = useFieldArray({ control, name: 'ingredients' })
  const steps = useFieldArray({ control, name: 'steps' })

  // Banner lives in RHF's root error slot so it clears on the next submit.
  const banner = errors.root?.message

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await submit(toCreateRecipeRequest(values))
      onSuccess(saved)
    } catch (err) {
      if (onError?.(err)) return
      if (err instanceof ApiValidationError) {
        const unmapped = applyServerErrors(err.errors, setError)
        setError('root', {
          type: 'server',
          message: unmapped.length ? unmapped.join(' ') : 'Please fix the highlighted fields.',
        })
      } else {
        setError('root', { type: 'server', message: errorFallback })
      }
    }
  })

  const difficulty = watch('difficulty')
  const visibility = watch('visibility')

  return (
    <form onSubmit={onSubmit} noValidate>
      {banner && (
        <div
          role="alert"
          style={{
            fontSize: 13,
            color: ERROR_COLOR,
            background: 'rgba(217, 83, 79, 0.10)',
            border: '1px solid rgba(217, 83, 79, 0.35)',
            borderRadius: 12,
            padding: '10px 12px',
            marginBottom: 16,
          }}
        >
          {banner}
        </div>
      )}

      {/* Basics */}
      <Card>
        <SectionTitle>Basics</SectionTitle>
        <TextField label="Title" autoFocus error={errors.title?.message} {...register('title')} />
        <label htmlFor="description" style={{ display: 'block', marginBottom: 14 }}>
          <FieldLabel>Description</FieldLabel>
          <textarea
            id="description"
            rows={3}
            aria-invalid={errors.description ? true : undefined}
            style={{ ...selectStyle, resize: 'vertical', lineHeight: 1.45 }}
            {...register('description')}
          />
          <FieldError message={errors.description?.message} />
        </label>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <TextField
              label="Prep (min)"
              type="number"
              inputMode="numeric"
              min={0}
              error={errors.prepTimeMinutes?.message}
              {...register('prepTimeMinutes')}
            />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              label="Cook (min)"
              type="number"
              inputMode="numeric"
              min={0}
              error={errors.cookTimeMinutes?.message}
              {...register('cookTimeMinutes')}
            />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              label="Servings"
              type="number"
              inputMode="numeric"
              min={1}
              error={errors.servings?.message}
              {...register('servings')}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <label htmlFor="difficulty" style={{ display: 'block', marginBottom: 14, flex: 1 }}>
            <FieldLabel>Difficulty</FieldLabel>
            <select id="difficulty" value={difficulty} style={selectStyle} {...register('difficulty')}>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </label>
          <label htmlFor="visibility" style={{ display: 'block', marginBottom: 14, flex: 1 }}>
            <FieldLabel>Visibility</FieldLabel>
            <select id="visibility" value={visibility} style={selectStyle} {...register('visibility')}>
              <option value="Public">Public</option>
              <option value="Private">Private</option>
              <option value="FriendsOnly">Friends only</option>
            </select>
          </label>
        </div>
      </Card>

      {/* Ingredients */}
      <Card>
        <SectionTitle>Ingredients</SectionTitle>
        {typeof errors.ingredients?.message === 'string' && (
          <FieldError message={errors.ingredients.message} />
        )}
        {ingredients.fields.map((field, idx) => (
          <div key={field.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <div style={{ flex: '0 0 76px' }}>
              <TextField
                label={idx === 0 ? 'Qty' : ''}
                aria-label={`Ingredient ${idx + 1} quantity`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                error={errors.ingredients?.[idx]?.quantity?.message}
                {...register(`ingredients.${idx}.quantity` as const)}
              />
            </div>
            <div style={{ flex: '0 0 84px' }}>
              <TextField
                label={idx === 0 ? 'Unit' : ''}
                aria-label={`Ingredient ${idx + 1} unit`}
                placeholder="g, cup…"
                error={errors.ingredients?.[idx]?.unit?.message}
                {...register(`ingredients.${idx}.unit` as const)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label={idx === 0 ? 'Name' : ''}
                aria-label={`Ingredient ${idx + 1} name`}
                error={errors.ingredients?.[idx]?.name?.message}
                {...register(`ingredients.${idx}.name` as const)}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove ingredient ${idx + 1}`}
              onClick={() => ingredients.remove(idx)}
              disabled={ingredients.fields.length === 1}
              style={{
                ...smallButtonStyle('ghost'),
                marginTop: idx === 0 ? 24 : 0,
                opacity: ingredients.fields.length === 1 ? 0.4 : 1,
                padding: '9px 11px',
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => ingredients.append({ name: '', quantity: '', unit: '' })}
          style={{ ...smallButtonStyle('ghost'), marginBottom: 12 }}
        >
          + Add ingredient
        </button>
      </Card>

      {/* Steps */}
      <Card>
        <SectionTitle>Steps</SectionTitle>
        {typeof errors.steps?.message === 'string' && <FieldError message={errors.steps.message} />}
        {steps.fields.map((field, idx) => (
          <div key={field.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 10 }}>
            <div
              style={{
                flex: '0 0 26px',
                marginTop: idx === 0 ? 26 : 2,
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--accent)',
              }}
            >
              {idx + 1}
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor={`step-${idx}`} style={{ display: 'block' }}>
                {idx === 0 && <FieldLabel>Instruction</FieldLabel>}
                <textarea
                  id={`step-${idx}`}
                  rows={2}
                  aria-label={`Step ${idx + 1} instruction`}
                  aria-invalid={errors.steps?.[idx]?.description ? true : undefined}
                  style={{ ...selectStyle, resize: 'vertical', lineHeight: 1.4 }}
                  {...register(`steps.${idx}.description` as const)}
                />
                <FieldError message={errors.steps?.[idx]?.description?.message} />
              </label>
            </div>
            <div style={{ flex: '0 0 92px' }}>
              <TextField
                label={idx === 0 ? 'Timer (s)' : ''}
                aria-label={`Step ${idx + 1} timer in seconds`}
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="opt."
                error={errors.steps?.[idx]?.timerSeconds?.message}
                {...register(`steps.${idx}.timerSeconds` as const)}
              />
            </div>
            <button
              type="button"
              aria-label={`Remove step ${idx + 1}`}
              onClick={() => steps.remove(idx)}
              disabled={steps.fields.length === 1}
              style={{
                ...smallButtonStyle('ghost'),
                marginTop: idx === 0 ? 24 : 0,
                opacity: steps.fields.length === 1 ? 0.4 : 1,
                padding: '9px 11px',
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => steps.append({ description: '', timerSeconds: '' })}
          style={{ ...smallButtonStyle('ghost'), marginBottom: 12 }}
        >
          + Add step
        </button>
      </Card>

      {/* Extras */}
      <Card>
        <SectionTitle>Extras</SectionTitle>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <TextField label="Cuisine" placeholder="Italian…" error={errors.cuisineType?.message} {...register('cuisineType')} />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              label="Calories / serving"
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="optional"
              error={errors.caloriesPerServing?.message}
              {...register('caloriesPerServing')}
            />
          </div>
        </div>
        <TextField label="Image URL" placeholder="https://…" error={errors.imageUrl?.message} {...register('imageUrl')} />
        <TextField
          label="Tags"
          placeholder="vegan, quick, dinner"
          error={typeof errors.tags?.message === 'string' ? errors.tags.message : undefined}
          {...register('tags')}
        />
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '-8px 0 10px' }}>
          Comma-separated. Saved lowercase so filters always match.
        </div>
      </Card>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 13,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            fontSize: 14.5,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: isSubmitting ? 'default' : 'pointer',
            opacity: isSubmitting ? 0.6 : 1,
          }}
        >
          {isSubmitting ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '12px 18px',
              borderRadius: 13,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--muted)',
              fontSize: 14.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
