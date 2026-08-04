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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useForm, useFieldArray, Controller, type UseFormSetError } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ApiError, ApiUnauthorizedError, ApiValidationError } from '@/api/client'
import { uploadImage, IMAGE_ACCEPT, IMAGE_ALLOWED_TYPES, IMAGE_MAX_BYTES } from '@/api/images'
import type { CreateRecipeRequest, Cuisine, RecipeResponse, RecipeTag, UnitOfMeasure } from '@/api/types'
import {
  CUISINES,
  MAX_TAGS,
  TAGS,
  UNIT_GROUPS,
  UNITS,
  label,
  unitLabel,
} from '@/api/vocabulary'
import { useAuth } from '@/auth/AuthContext'
import { resolveImageUrl } from '@/lib/images'
import TextField from '@/components/ui/TextField'
import { IngredientNameField } from '@/components/recipes/IngredientNameField'
import { TagPicker } from '@/components/recipes/TagPicker'

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
  // Stream G: a closed vocabulary, so this is membership rather than
  // non-emptiness. The control is a <select> whose options come from the same
  // list, so the only way to fail this is a tampered DOM — which is exactly the
  // case a schema should still catch.
  unit: z.enum(UNITS as [UnitOfMeasure, ...UnitOfMeasure[]]),
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
  // '' is the "no particular cuisine" option and becomes null on the wire —
  // distinct from 'Other', which claims a real cuisine that is not on the list.
  cuisineType: z.union([z.enum(CUISINES as [Cuisine, ...Cuisine[]]), z.literal('')]),
  caloriesPerServing: z
    .string()
    .trim()
    .refine((v) => v === '' || wholeNumberRe.test(v), 'Calories must be a whole number ≥ 0'),
  imageUrl: z.string().trim(),
  ingredients: z.array(ingredientSchema).min(1, 'Add at least one ingredient'),
  steps: z.array(stepSchema).min(1, 'Add at least one step'),
  tags: z.array(z.enum(TAGS as [RecipeTag, ...RecipeTag[]])).max(MAX_TAGS, `At most ${MAX_TAGS} tags`),
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
  // Gram is the default unit, not a blank: with a closed vocabulary there is no
  // empty member to start on, and weight is what most ingredients are measured
  // in. The author changes it in one click when it is wrong.
  ingredients: [{ name: '', quantity: '', unit: 'Gram' }],
  steps: [{ description: '', timerSeconds: '' }],
  tags: [],
}

/**
 * Form values → CreateRecipeRequest wire body. stepNumber is assigned here as
 * index + 1 (never a form field); blank optionals become null.
 *
 * Stream G removed the tag normalisation that used to live here — the split on
 * commas, the trim, the lowercasing, the de-dupe. All four existed to make free
 * text survive a case-SENSITIVE match-ALL filter, and the chip picker makes them
 * unnecessary: a tag is now a member or it is not in the array.
 *
 * The PUT (update) body is structurally identical to CreateRecipeRequest, so
 * checkpoint 06 reuses this same converter for edits.
 */
export function toCreateRecipeRequest(v: RecipeFormValues): CreateRecipeRequest {
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
    cuisineType: v.cuisineType === '' ? null : v.cuisineType,
    caloriesPerServing: calories ? Number(calories) : null,
    imageUrl: imageUrl ? imageUrl : null,
    ingredients: v.ingredients.map((i) => ({
      name: i.name.trim(),
      quantity: Number(i.quantity),
      unit: i.unit,
    })),
    steps: v.steps.map((s, idx) => ({
      stepNumber: idx + 1,
      description: s.description.trim(),
      timerSeconds: s.timerSeconds.trim() ? Number(s.timerSeconds) : null,
    })),
    tags: v.tags,
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
      : [{ name: '', quantity: '', unit: 'Gram' as const }],
    steps: r.steps.length
      ? r.steps.map((s) => ({
          description: s.description,
          timerSeconds: s.timerSeconds != null ? String(s.timerSeconds) : '',
        }))
      : [{ description: '', timerSeconds: '' }],
    tags: r.tags,
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

// ── Photo upload (social-feed cp07) ─────────────────────────────────────────

/**
 * Map an upload failure onto a legible sentence. The backend 400s carry a
 * ValidationProblem keyed on `file` (type/size/magic-byte); 429 is the
 * `images` rate lane (20/min); anything else gets the generic fallback.
 */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiValidationError) {
    const first = Object.values(err.errors).flat()[0]
    return first ?? 'That image was rejected — use a JPEG, PNG, or WebP under 5 MB.'
  }
  if (err instanceof ApiUnauthorizedError) {
    return 'Your session has expired — please sign in again.'
  }
  if (err instanceof ApiError && err.status === 429) {
    return 'Too many uploads right now — wait a minute and try again.'
  }
  return 'The photo upload failed. Check your connection and try again.'
}

// Visually-hidden-but-focusable file input (label acts as the button).
const srOnlyInputStyle: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
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
  /**
   * The caller's account-level default visibility, applied to a still-untouched
   * form once it loads. CREATE MODE ONLY — the edit overlay must never override
   * a saved recipe's own visibility with an account preference.
   */
  applyDefaultVisibility?: RecipeFormValues['visibility']
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
  applyDefaultVisibility,
}: RecipeFormProps) {
  const {
    register,
    handleSubmit,
    control,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RecipeFormValues>({ resolver: zodResolver(recipeFormSchema), defaultValues })

  // The caller's "default visibility" account setting arrives asynchronously
  // (it lives on the profile), so it can land after the form has mounted.
  // Apply it only while the form is still untouched: remounting the form or
  // resetting a dirty one would throw away whatever the user had already typed
  // — a far worse bug than the wrong default. Create mode only; the edit page
  // never passes this, because a saved recipe's own visibility is the truth.
  useEffect(() => {
    if (!applyDefaultVisibility || isDirty) return
    setValue('visibility', applyDefaultVisibility)
  }, [applyDefaultVisibility, isDirty, setValue])

  const ingredients = useFieldArray({ control, name: 'ingredients' })
  const steps = useFieldArray({ control, name: 'steps' })

  // ── Photo upload (social-feed cp07) ──────────────────────────────────────
  // On select: client-side pre-checks (save the 20/min `images` rate budget),
  // instant local preview while the multipart POST runs, then the returned
  // RELATIVE url lands in the existing `imageUrl` field and previews through
  // resolveImageUrl. `seq` guards a replaced/removed upload from clobbering
  // the newer state; submit is blocked while an upload is pending.
  const { user } = useAuth()
  const [uploadPending, setUploadPending] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const uploadRef = useRef<{ seq: number; controller: AbortController | null }>({
    seq: 0,
    controller: null,
  })

  const imageUrl = watch('imageUrl').trim()
  const previewSrc = localPreview ?? (imageUrl ? resolveImageUrl(imageUrl) : null)

  const handlePhotoSelected = async (file: File) => {
    setUploadError(null)

    // Pre-checks mirror the backend rules (allowlist + 5 MB cap) so obvious
    // rejects never spend an upload slot; the backend stays the authority.
    if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
      setUploadError('That file type is not supported — choose a JPEG, PNG, or WebP image.')
      return
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setUploadError('That image is too large — the limit is 5 MB.')
      return
    }

    uploadRef.current.controller?.abort()
    const controller = new AbortController()
    const seq = ++uploadRef.current.seq
    uploadRef.current.controller = controller

    // Instant preview while the upload runs. Best-effort: under vitest, Node's
    // native URL.createObjectURL exists but rejects jsdom File objects, so a
    // failure here just means "no local preview" — never a broken upload.
    let local: string | null = null
    try {
      if (typeof URL.createObjectURL === 'function') local = URL.createObjectURL(file)
    } catch {
      local = null
    }
    setLocalPreview(local)
    setUploadPending(true)

    try {
      const { url } = await uploadImage(file, {
        token: user?.token ?? null,
        signal: controller.signal,
      })
      if (seq !== uploadRef.current.seq) return
      setValue('imageUrl', url, { shouldDirty: true })
    } catch (err) {
      if (seq !== uploadRef.current.seq || controller.signal.aborted) return
      setUploadError(uploadErrorMessage(err))
    } finally {
      if (seq === uploadRef.current.seq) {
        setUploadPending(false)
        setLocalPreview(null)
        uploadRef.current.controller = null
      }
      if (local && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(local)
    }
  }

  const removePhoto = () => {
    uploadRef.current.controller?.abort()
    uploadRef.current.seq++
    uploadRef.current.controller = null
    setUploadPending(false)
    setLocalPreview(null)
    setUploadError(null)
    setValue('imageUrl', '', { shouldDirty: true })
  }

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

      {/* Photo (social-feed cp07) — uploads land in the imageUrl field. */}
      <Card>
        <SectionTitle>Photo</SectionTitle>
        {previewSrc && (
          <img
            src={previewSrc}
            alt="Recipe photo preview"
            style={{
              display: 'block',
              width: '100%',
              maxHeight: 220,
              objectFit: 'cover',
              borderRadius: 14,
              border: '1px solid var(--border)',
              marginBottom: 12,
            }}
          />
        )}
        {uploadPending && (
          <div role="status" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
            Uploading photo…
          </div>
        )}
        <FieldError message={uploadError ?? undefined} />
        <div style={{ display: 'flex', gap: 10, margin: uploadError ? '8px 0 10px' : '0 0 10px' }}>
          <label style={{ ...smallButtonStyle('ghost'), position: 'relative' }}>
            {previewSrc ? 'Replace photo' : 'Add photo'}
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              disabled={uploadPending}
              style={srOnlyInputStyle}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = '' // allow re-selecting the same file
                if (file) void handlePhotoSelected(file)
              }}
            />
          </label>
          {previewSrc && !uploadPending && (
            <button type="button" onClick={removePhoto} style={smallButtonStyle('danger')}>
              Remove photo
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
          JPEG, PNG, or WebP, up to 5 MB. Optional — you can publish without one.
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
            <div style={{ flex: '0 0 104px' }}>
              {idx === 0 && <FieldLabel>Unit</FieldLabel>}
              {/* Grouped by dimension: 21 units in a flat list is a scroll, and
                  the groups also say which of them the shopping list can add
                  together. */}
              <select
                aria-label={`Ingredient ${idx + 1} unit`}
                style={selectStyle}
                {...register(`ingredients.${idx}.unit` as const)}
              >
                {UNIT_GROUPS.map((group) => (
                  <optgroup key={group.dimension} label={group.label}>
                    {group.units.map((unit) => (
                      <option key={unit} value={unit}>
                        {unitLabel(unit)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {errors.ingredients?.[idx]?.unit?.message && (
                <FieldError message={errors.ingredients[idx]!.unit!.message!} />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <IngredientNameField
                label={idx === 0 ? 'Name' : ''}
                aria-label={`Ingredient ${idx + 1} name`}
                error={errors.ingredients?.[idx]?.name?.message}
                registration={register(`ingredients.${idx}.name` as const)}
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
          onClick={() => ingredients.append({ name: '', quantity: '', unit: 'Gram' })}
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
          <label htmlFor="cuisineType" style={{ display: 'block', marginBottom: 14, flex: 1 }}>
            <FieldLabel>Cuisine</FieldLabel>
            <select id="cuisineType" style={selectStyle} {...register('cuisineType')}>
              {/* The empty option is a real answer, not a prompt: most dishes
                  belong to no particular cuisine. */}
              <option value="">No particular cuisine</option>
              {CUISINES.map((cuisine) => (
                <option key={cuisine} value={cuisine}>
                  {label(cuisine)}
                </option>
              ))}
            </select>
            {errors.cuisineType?.message && <FieldError message={errors.cuisineType.message} />}
          </label>
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
        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <TagPicker
              selected={field.value}
              onChange={field.onChange}
              error={typeof errors.tags?.message === 'string' ? errors.tags.message : undefined}
            />
          )}
        />
      </Card>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
        <button
          type="submit"
          // cp07: an in-flight photo upload blocks submit so a half-uploaded
          // image can never race the save (the url lands only on 201).
          disabled={isSubmitting || uploadPending}
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
            cursor: isSubmitting || uploadPending ? 'default' : 'pointer',
            opacity: isSubmitting || uploadPending ? 0.6 : 1,
          }}
        >
          {isSubmitting ? pendingLabel : uploadPending ? 'Uploading photo…' : submitLabel}
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
