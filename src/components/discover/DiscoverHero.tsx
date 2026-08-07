// ─────────────────────────────────────────────────────────────────────────
// The Discover cover story (Discover redesign, section A).
//
// One recipe, given the space a magazine gives its cover. Two shapes, because
// the same content wants different furniture at each width: on a phone the
// text sits ON the photo under a scrim; on desktop the fold splits 1.5fr/1fr
// and the text moves onto a cream panel beside it, in ink rather than white.
//
// The featured recipe is the caller's top result today. Whether it should
// instead be an editorially pinned field on the backend is an open product
// question (handoff §State Management) — this component only renders whatever
// RecipeResponse it is handed.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { RecipeResponse } from '@/api/types'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

interface DiscoverHeroProps {
  recipe: RecipeResponse
  onOpen: () => void
  isDesktop: boolean
}

/** The eyebrow above the cover, in both layouts. */
const HERO_EYEBROW = 'COVER STORY · TONIGHT'

/**
 * "30 min · Easy · 4 servings".
 *
 * No "by {author}": RecipeResponse carries `createdByUserId` and no username,
 * and resolving one is a profile fetch — deferred with the rest of the wiring.
 * An omitted byline is the honest version; an invented one is not.
 */
function byline(recipe: RecipeResponse): string {
  const parts: string[] = []
  if (recipe.totalTimeMinutes) parts.push(formatMinutes(recipe.totalTimeMinutes))
  parts.push(recipe.difficulty)
  parts.push(`${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

function photoStyle(recipe: RecipeResponse): CSSProperties {
  return recipe.imageUrl
    ? {
        backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: gradientFor(recipe.id || recipe.title) }
}

export default function DiscoverHero({ recipe, onOpen, isDesktop }: DiscoverHeroProps) {
  const activate = {
    role: 'link' as const,
    tabIndex: 0,
    'aria-label': `Cover story: ${recipe.title}`,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    },
    style: { cursor: 'pointer' } as CSSProperties,
  }

  if (isDesktop) {
    return (
      <div
        {...activate}
        style={{
          ...activate.style,
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          height: 310,
          borderRadius: 24,
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <div style={photoStyle(recipe)} />
        <div
          style={{
            background: 'var(--surface2)',
            padding: '30px 28px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--tagcol)' }}>
            {HERO_EYEBROW}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 33,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}
          >
            {recipe.title}
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--tagcol)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {recipe.description}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{byline(recipe)}</div>
          <span
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              borderRadius: 12,
              padding: '11px 20px',
              fontSize: 14,
              fontWeight: 800,
              marginTop: 4,
              background: 'var(--accent-fill)',
              color: 'var(--accent-ink)',
            }}
          >
            Cook this tonight
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      {...activate}
      style={{
        ...activate.style,
        position: 'relative',
        height: 388,
        borderRadius: 22,
        overflow: 'hidden',
        marginBottom: 12,
        ...photoStyle(recipe),
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '90px 18px 18px',
          background: 'linear-gradient(180deg, rgba(42,38,29,0) 0%, rgba(42,38,29,0.85) 72%)',
          color: '#fffef9',
        }}
      >
        {/* A lightened accent-fill: the token itself is too dark to read on a
            photograph, and this text is always over one. */}
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', color: '#e8e29a', marginBottom: 8 }}>
          {HERO_EYEBROW}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 29,
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: '-0.01em',
          }}
        >
          {recipe.title}
        </div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,254,249,0.85)', margin: '8px 0 12px' }}>{byline(recipe)}</div>
        {/* Light pill on a dark photo — inverted from the rest of the UI on
            purpose, and the one place that inversion is correct. */}
        <span
          style={{
            display: 'inline-block',
            borderRadius: 999,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 800,
            background: '#fbf9ef',
            color: '#2a261d',
          }}
        >
          Cook this ›
        </span>
      </div>
    </div>
  )
}
