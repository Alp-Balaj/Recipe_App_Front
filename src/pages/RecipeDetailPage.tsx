import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRecipe, isNotFound } from '@/hooks/useRecipe'
import { useSocialEnvelope } from '@/hooks/useSocialEnvelope'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import type { RecipeResponse, RecipeStep } from '@/api/types'
import { CommentsPanel } from '@/components/CommentsPanel'
import ReportModal from '@/components/ReportModal'
import StateBlock from '@/components/ui/StateBlock'
import { resolveImageUrl } from '@/lib/images'
import {
  formatDuration,
  formatMinutes,
  formatQuantity,
  gradientFor,
  visibilityLabel,
} from './recipeVisuals'
import RecipeInsights from '@/components/recipes/RecipeInsights'
import CookMode from '@/components/recipes/CookMode'
import { formatTemperature, label } from '@/api/vocabulary'

export default function RecipeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(id)
  const [cooking, setCooking] = useState(false)
  // stream D (governor): the report dialog for this recipe.
  const [reporting, setReporting] = useState(false)
  // cp06: like/save via the decision-I3 envelope seam (feed-cache hits when
  // the reader arrived from /feed). F1 (decision recipe-social-envelope-
  // endpoint): when the caches can't answer — notably for the recipe's OWN
  // author, whose posts never reach their feed — fall back to ONE
  // GET /recipes/{id}/social to seed real counts + flags; 404 degrades to
  // the old hidden-counts rendering.
  const envelope = useSocialEnvelope(id ?? '', undefined, { fetchFallback: true })
  const { toggleLike, toggleSave, setRating } = useSocialMutations()
  const { requireAuth } = useAuthGate()

  const close = () => {
    // Back to wherever we came from; deep links with no in-app history → Discover.
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/discover', { replace: true })
  }

  if (isLoading) {
    return <StateBlock variant="page" title="Loading recipe…" body="Fetching the details." />
  }

  if (isError && isNotFound(error)) {
    return (
      <StateBlock
        variant="page"
        title="Recipe not found"
        body="This recipe doesn't exist, was removed, or isn't shared with you."
        action={{ label: 'Back to Discover', onClick: () => navigate('/discover', { replace: true }) }}
      />
    )
  }

  if (isError || !recipe) {
    return (
      <StateBlock
        variant="page"
        title="Couldn't load this recipe"
        body="Something went wrong reaching the kitchen. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => refetch() }}
      />
    )
  }

  const isOwn = !!user && recipe.createdByUserId === user.userId
  // cp06: cp04 uploads are RELATIVE urls — route them through the /api proxy.
  const header = recipe.imageUrl
    ? { backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: gradientFor(recipe.id || recipe.title) }

  return (
    <div
      className="animate-detailIn"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 10,
        animation: 'detailIn 0.3s cubic-bezier(0.2, 0.7, 0.2, 1)',
      }}
    >
      <div className="scroll" style={{ position: 'absolute', inset: 0, bottom: recipe.steps.length ? 92 : 0, overflowY: 'auto' }}>
        {/* Header — imageUrl when present, gradient fallback otherwise. */}
        <div style={{ position: 'relative', height: 210, ...header }}>
          <button
            onClick={close}
            aria-label="Back"
            style={roundIconBtn(18)}
          >
            ←
          </button>
          {/* cp06: the header hearts go live — like + save through the shared
              social hook (state from the envelope seam; counts show when known). */}
          <button
            onClick={() => {
              // Guest access (§4.4): gate before .mutate — no optimistic patch for guests.
              if (!requireAuth()) return
              toggleLike.mutate({ recipeId: recipe.id, next: !envelope.likedByMe })
            }}
            aria-pressed={envelope.likedByMe === true}
            aria-label={envelope.likedByMe ? 'Unlike' : 'Like'}
            style={{
              ...roundIconBtn(17),
              right: 64,
              left: 'auto',
              width: 'auto',
              minWidth: 38,
              padding: '0 12px',
              gap: 6,
              borderRadius: 999,
              color: envelope.likedByMe ? '#da0909' : '#fff',
            }}
          >
            {envelope.likedByMe ? '♥' : '♡'}
            {envelope.likeCount !== null && (
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{envelope.likeCount}</span>
            )}
          </button>
          <button
            onClick={() => {
              if (!requireAuth()) return
              toggleSave.mutate({ recipeId: recipe.id, next: !envelope.savedByMe })
            }}
            aria-pressed={envelope.savedByMe === true}
            aria-label={envelope.savedByMe ? 'Remove from saved' : 'Save recipe'}
            style={{
              ...roundIconBtn(16),
              right: 18,
              left: 'auto',
              color: envelope.savedByMe ? '#fd9424' : '#fff',
            }}
          >
            {envelope.savedByMe ? '⚑' : '⚐'}
          </button>
          {/* stream D (governor): report — a fourth round header action, own
              recipes excluded (the backend 400s a self-report anyway). */}
          {!isOwn && (
            <button
              onClick={() => {
                if (!requireAuth()) return
                setReporting(true)
              }}
              aria-label="Report recipe"
              title="Report this recipe"
              style={{
                ...roundIconBtn(15),
                right: 130,
                left: 'auto',
              }}
            >
              !
            </button>
          )}
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', flex: 1 }}>
              {recipe.title}
            </div>
            {/* Stream E (decision D1): a generated recipe is an ordinary user-owned
                recipe in every mechanism — the flag is the ONLY thing that marks it,
                so this badge is where the provenance claim is actually kept. Shown to
                every reader, not just the owner: who wrote a recipe is the reader's
                business, and the badge is why the app can be honest about it. */}
            {recipe.isAiGenerated && (
              <Badge
                variant="outline"
                className="text-[11px] font-bold shrink-0 mt-1"
                style={{ background: 'var(--chipbg)', borderColor: 'transparent', color: 'var(--chipcol)' }}
                title="Written by the AI assistant and saved by its owner"
              >
                AI-generated
              </Badge>
            )}
            {isOwn && (
              <Badge
                variant="outline"
                className="text-[11px] font-bold shrink-0 mt-1"
                style={{ background: 'var(--chipbg)', borderColor: 'transparent', color: 'var(--chipcol)' }}
              >
                {visibilityLabel(recipe.visibility)}
              </Badge>
            )}
          </div>
          <div style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 8 }}>
            {recipe.description}
          </div>

          {/* Quick stats — total time, servings, difficulty. */}
          <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
            {[
              { icon: '◷', val: formatMinutes(recipe.totalTimeMinutes) },
              { icon: '⊙', val: `${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}` },
              { icon: '☍', val: recipe.difficulty },
            ].map(({ icon, val }) => (
              <div key={val} style={statTile}>
                {icon} {val}
              </div>
            ))}
          </div>

          {/* Prep / cook breakdown + cuisine. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 12.5, color: 'var(--muted)' }}>
            <span>Prep {formatMinutes(recipe.prepTimeMinutes)}</span>
            <span>Cook {formatMinutes(recipe.cookTimeMinutes)}</span>
            {recipe.cuisineType && <span>{label(recipe.cuisineType)}</span>}
          </div>

          {/* Nutrition — caloriesPerServing only (macro tiles removed, Decision 6). */}
          {recipe.caloriesPerServing != null && (
            <div
              style={{
                marginTop: 14,
                background: 'var(--surface2)',
                borderRadius: 14,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 20, fontWeight: 800 }}>{recipe.caloriesPerServing}</span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>kcal per serving</span>
            </div>
          )}

          {/* Computed nutrition + dietary checks (stream G, slice G4). Sits BESIDE
              the author's hand-typed caloriesPerServing above rather than replacing
              it: the two answer different questions — what the author said, and what
              the ingredients add up to. */}
          <RecipeInsights recipeId={recipe.id} />

          {/* Tags. */}
          {recipe.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
              {recipe.tags.map((t) => (
                <Badge
                  key={t}
                  variant="outline"
                  className="text-[11.5px] font-normal"
                  style={{ background: 'var(--tagbg)', borderColor: 'var(--tagborder)', color: 'var(--tagcol)' }}
                >
                  {label(t)}
                </Badge>
              ))}
            </div>
          )}

          {/* Ingredients. */}
          <SectionLabel>Ingredients</SectionLabel>
          {recipe.ingredients.map((ing, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: '9px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              <span style={{ flexShrink: 0, minWidth: 64, fontSize: 13.5, color: 'var(--muted)' }}>
                {formatQuantity(ing.quantity, ing.unit)}
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{ing.name}</span>
            </div>
          ))}

          {/* Steps — NEW at checkpoint 03. Numbered, with formatted per-step timers. */}
          {recipe.steps.length > 0 && (
            <>
              <SectionLabel>Steps</SectionLabel>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...recipe.steps]
                  .sort((a, b) => a.stepNumber - b.stepNumber)
                  .map((step, i) => (
                    <StepRow key={i} index={i} step={step} ingredients={recipe.ingredients} />
                  ))}
              </ol>
            </>
          )}

          {/* Rating — open-loops slice 1. Sits directly above Comments because
              it is the other "how did it go" affordance, and because by the
              time you have scrolled past the steps you have an opinion. */}
          <SectionLabel>
            Rating
            {envelope.ratingCount !== null && envelope.ratingCount > 0
              ? ` (${envelope.ratingCount})`
              : ''}
          </SectionLabel>
          <RatingRow
            average={envelope.averageRating}
            count={envelope.ratingCount}
            mine={envelope.myRating}
            pending={setRating.isPending}
            onRate={(value) => {
              if (!requireAuth()) return
              setRating.mutate({ recipeId: recipe.id, rating: value })
            }}
          />

          {/* Comments — cp06: the inline testimonial-row panel (both widths;
              the feed card is where the mobile bottom sheet lives). */}
          <SectionLabel>
            Comments{envelope.commentCount !== null ? ` (${envelope.commentCount})` : ''}
          </SectionLabel>
          <CommentsPanel recipeId={recipe.id} recipeAuthorId={recipe.createdByUserId} />
        </div>
      </div>

      {/* Start cooking — enters a minimal step-by-step mode (only when there are steps). */}
      {recipe.steps.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: '14px 18px 22px',
            background: 'linear-gradient(to top, var(--bg) 72%, transparent)',
          }}
        >
          <Button
            onClick={() => setCooking(true)}
            className="w-full rounded-2xl text-base font-bold py-4 h-auto active:scale-[0.99] transition-transform"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            ▷ Start cooking
          </Button>
        </div>
      )}

      {/* Stream M. J's placeholder overlay lived in this file; the real cook
          mode is its own module — timers, wake lock, serving scaling and a
          bounded assistant are a surface rather than a helper, and keeping the
          entry point here is what keeps this page's diff readable.

          It is handed the caller's own rating and the rate mutation rather than
          owning either: "Finished cooking" closes into the SAME cook-and-rate
          action the Rating row above uses, which is what makes the loop worth
          anything — one write path, one cache patch, no second opinion about
          what the caller thought of the dish. */}
      {cooking && (
        <CookMode
          recipe={recipe}
          myRating={envelope.myRating}
          onRate={(value) => setRating.mutate({ recipeId: recipe.id, rating: value })}
          requireAuth={requireAuth}
          onExit={() => setCooking(false)}
        />
      )}

      {reporting && (
        <ReportModal
          targetType="Recipe"
          targetId={recipe.id}
          targetLabel="this recipe"
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  )
}

/**
 * Read the room's rating, set your own. Tapping the star you already gave
 * retracts it (the backend drops the row), which is the only undo there is —
 * so the label says so rather than leaving people stuck at a mis-tap.
 *
 * `average`/`count` null means "not known on this surface", which renders the
 * same as "nobody has rated": no number. That collision is deliberate and is
 * documented in useSocialEnvelope.
 */
function RatingRow({
  average,
  count,
  mine,
  pending,
  onRate,
}: {
  average: number | null
  count: number | null
  mine: number | null
  pending: boolean
  onRate: (value: number | null) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 2 }} role="group" aria-label="Rate this recipe">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = mine !== null && star <= mine
          return (
            <button
              key={star}
              onClick={() => onRate(mine === star ? null : star)}
              disabled={pending}
              aria-pressed={filled}
              aria-label={
                mine === star ? `Remove your ${star}-star rating` : `Rate ${star} out of 5`
              }
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 3px',
                fontSize: 22,
                lineHeight: 1,
                cursor: pending ? 'default' : 'pointer',
                color: filled ? 'var(--accent)' : 'var(--muted)',
                opacity: pending ? 0.6 : 1,
              }}
            >
              {filled ? '★' : '☆'}
            </button>
          )
        })}
      </div>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {average !== null && count
          ? `${average.toFixed(1)} from ${count} ${count === 1 ? 'rating' : 'ratings'}`
          : 'No ratings yet'}
        {mine !== null ? ' · tap your star again to undo' : ''}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        fontWeight: 700,
        margin: '22px 0 4px',
      }}
    >
      {children}
    </div>
  )
}

/**
 * The ingredient lines a step consumes, resolved through decision D16's indexes.
 *
 * Returns only the references that land on a real line. The backend validates
 * that every stored index is in range on both write paths, so an out-of-range
 * one should be impossible — but this page also renders recipes fetched from a
 * cache that may predate an edit, and a step is worth reading with one chip
 * missing rather than not at all.
 */
function referencedIngredients(step: RecipeStep, all: RecipeResponse['ingredients']) {
  return (step.ingredientIndexes ?? [])
    .map((i) => all[i])
    .filter((ing): ing is RecipeResponse['ingredients'][number] => ing != null)
}

/**
 * One step, read as a typed value (stream J).
 *
 * The redesign is what J's Q6 ruling asked for alongside the model: a step used
 * to be prose with an optional timer appended, which is all a three-field step
 * could say. It now leads with its facts — what it uses, how long it takes, how
 * hot — and the prose sits under them.
 *
 * DECISION D17, partially: the quantity is rendered FROM the referenced line
 * beside the instruction, rather than being repeated inside the prose. That is
 * the third answer D17 names, and it is the half stream J can settle on its own
 * — whichever way M decides serving scaling should behave, a quantity that is
 * rendered from the ingredient list scales with it for free, and one baked into
 * the prose never can. What J does NOT settle is whether scaling happens at all;
 * this renders the stored quantity as stored.
 */
function StepRow({
  index,
  step,
  ingredients,
}: {
  index: number
  step: RecipeStep
  ingredients: RecipeResponse['ingredients']
}) {
  const duration = step.durationSeconds != null ? formatDuration(step.durationSeconds) : ''
  const used = referencedIngredients(step, ingredients)

  return (
    <li style={{ display: 'flex', gap: 13, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <span
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--surface2)',
          color: 'var(--text)',
          fontSize: 13,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {index + 1}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* The meta strip sits ABOVE the prose: reading "12 min · 180 °C" before
            the instruction is what lets someone scanning a method plan around
            it. Absent entirely when the step has neither, which keeps an
            untyped step reading exactly as it did before. */}
        {(duration || step.temperature) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 6 }}>
            {duration && (
              <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700 }}>◷ {duration}</span>
            )}
            {step.temperature && (
              <span style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700 }}>
                ◈ {formatTemperature(step.temperature)}
              </span>
            )}
          </div>
        )}

        <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{step.description}</div>

        {used.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {used.map((ing, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-flex',
                  alignItems: 'baseline',
                  gap: 5,
                  borderRadius: 999,
                  padding: '4px 10px',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  fontSize: 12,
                }}
              >
                <span style={{ fontWeight: 700 }}>{formatQuantity(ing.quantity, ing.unit)}</span>
                <span style={{ color: 'var(--muted)' }}>{ing.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

// ── Small inline style helpers ──────────────────────────────────────────────

const statTile = {
  flex: 1,
  textAlign: 'center',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '9px 6px',
  fontSize: 13,
  fontWeight: 600,
} as const

function roundIconBtn(fontSize: number) {
  return {
    position: 'absolute',
    top: 54,
    left: 18,
    width: 38,
    height: 38,
    borderRadius: '50%',
    background: 'rgba(0,0,0,.32)',
    backdropFilter: 'blur(6px)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize,
    cursor: 'pointer',
  } as const
}
