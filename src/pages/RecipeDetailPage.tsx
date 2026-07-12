import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRecipe, isNotFound } from '@/hooks/useRecipe'
import type { RecipeResponse, RecipeStep } from '@/api/types'
import {
  formatMinutes,
  formatQuantity,
  formatTimer,
  gradientFor,
  visibilityLabel,
} from './recipeVisuals'

const PAGE_STYLE = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 16px',
} as const

/** Shared shell for the loading / not-found / error placeholder states. */
function DetailMessage({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="scroll" style={PAGE_STYLE}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px 0 18px' }}>
        {body}
      </div>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            cursor: 'pointer',
            border: 'none',
            borderRadius: 13,
            padding: '11px 16px',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

export default function RecipeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(id)
  const [cooking, setCooking] = useState(false)

  const close = () => {
    // Back to wherever we came from; deep links with no in-app history → library.
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/library', { replace: true })
  }

  if (isLoading) {
    return <DetailMessage title="Loading recipe…" body="Fetching the details." />
  }

  if (isError && isNotFound(error)) {
    return (
      <DetailMessage
        title="Recipe not found"
        body="This recipe doesn't exist, was removed, or isn't shared with you."
        action={{ label: 'Back to library', onClick: () => navigate('/library', { replace: true }) }}
      />
    )
  }

  if (isError || !recipe) {
    return (
      <DetailMessage
        title="Couldn't load this recipe"
        body="Something went wrong reaching the kitchen. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => refetch() }}
      />
    )
  }

  const isOwn = !!user && recipe.createdByUserId === user.userId
  const header = recipe.imageUrl
    ? { backgroundImage: `url(${recipe.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
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
          {/* Saved recipes are phase 5 — the heart is disabled with a tooltip. */}
          <button
            disabled
            title="Saving recipes is coming soon"
            aria-label="Save recipe (coming soon)"
            style={{ ...roundIconBtn(17), right: 18, left: 'auto', opacity: 0.45, cursor: 'not-allowed' }}
          >
            ♡
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em', flex: 1 }}>
              {recipe.title}
            </div>
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
            {recipe.cuisineType && <span>{recipe.cuisineType}</span>}
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
                  {t}
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
                    <StepRow key={i} index={i} step={step} />
                  ))}
              </ol>
            </>
          )}
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

      {cooking && <CookMode recipe={recipe} onExit={() => setCooking(false)} />}
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

function StepRow({ index, step }: { index: number; step: RecipeStep }) {
  const timer = step.timerSeconds != null ? formatTimer(step.timerSeconds) : ''
  return (
    <li style={{ display: 'flex', gap: 13, padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
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
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>{step.description}</div>
        {timer && (
          <div style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 700, marginTop: 4 }}>
            ◷ {timer}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Minimal step-by-step cooking mode — a full-bleed overlay (covers just the
 * detail pane on desktop) showing one step at a time with its timer and
 * Prev/Next. Presentational only: no live countdown (that can come later).
 */
function CookMode({ recipe, onExit }: { recipe: RecipeResponse; onExit: () => void }) {
  const steps = [...recipe.steps].sort((a, b) => a.stepNumber - b.stepNumber)
  const [i, setI] = useState(0)
  const step = steps[i]
  const timer = step.timerSeconds != null ? formatTimer(step.timerSeconds) : ''
  const last = i === steps.length - 1

  return (
    <div
      role="dialog"
      aria-label="Step-by-step cooking"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '54px 22px 22px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700 }}>
          Step {i + 1} of {steps.length}
        </div>
        <button
          onClick={onExit}
          aria-label="Exit cooking mode"
          style={{ ...roundIconBtn(18), position: 'static', width: 34, height: 34, background: 'var(--surface2)', color: 'var(--text)' }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>{recipe.title}</div>
        <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.4 }}>{step.description}</div>
        {timer && (
          <div style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 800, marginTop: 14 }}>◷ {timer}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          onClick={() => setI((n) => Math.max(0, n - 1))}
          disabled={i === 0}
          className="flex-1 rounded-2xl text-base font-bold py-4 h-auto"
          style={{ background: 'var(--surface2)', color: 'var(--text)', opacity: i === 0 ? 0.5 : 1 }}
        >
          ← Prev
        </Button>
        <Button
          onClick={() => (last ? onExit() : setI((n) => Math.min(steps.length - 1, n + 1)))}
          className="flex-1 rounded-2xl text-base font-bold py-4 h-auto"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {last ? 'Done ✓' : 'Next →'}
        </Button>
      </div>
    </div>
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
