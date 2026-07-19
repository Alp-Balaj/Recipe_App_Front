// ─────────────────────────────────────────────────────────────────────────
// The compact recipe list-row used on the profile Recipes tab (design 3d/4a):
// a square thumbnail, title + visibility chip, a "◷ time · cuisine" meta line,
// and an owner action footer (Edit / Share / Delete). The thumbnail + text are
// one keyboard-operable link to the detail route; the footer buttons live
// OUTSIDE that link (same idiom as the shared RecipeCard).
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, KeyboardEvent } from 'react'
import type { RecipeResponse } from '@/api/types'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor, visibilityLabel } from '@/pages/recipeVisuals'

interface Props {
  recipe: RecipeResponse
  onOpen: () => void
  onEdit: () => void
  onShare: () => void
  onDelete: () => void
  /** Thumbnail size in px (mobile rows 64, desktop grid 70). */
  thumbSize?: number
}

export default function RecipeListRow({ recipe, onOpen, onEdit, onShare, onDelete, thumbSize = 64 }: Props) {
  const thumbBg = recipe.imageUrl
    ? {
        backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: gradientFor(recipe.id || recipe.title) }

  return (
    <div style={card}>
      <div
        role="link"
        tabIndex={0}
        aria-label={recipe.title}
        onClick={onOpen}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
        style={{ display: 'flex', gap: 13, alignItems: 'center', cursor: 'pointer', minWidth: 0 }}
      >
        <div style={{ width: thumbSize, height: thumbSize, borderRadius: 14, flexShrink: 0, ...thumbBg }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                fontSize: 14.5,
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {recipe.title}
            </div>
            <span style={visChip}>{visibilityLabel(recipe.visibility)}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
            ◷ {formatMinutes(recipe.totalTimeMinutes)}
            {recipe.cuisineType ? ` · ${recipe.cuisineType}` : ''}
          </div>
        </div>
      </div>

      {/* Owner action footer (outside the link region). */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <ActionChip onClick={onEdit}>Edit</ActionChip>
        <ActionChip onClick={onShare}>Share</ActionChip>
        <ActionChip onClick={onDelete} danger>
          Delete
        </ActionChip>
      </div>
    </div>
  )
}

function ActionChip({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button onClick={onClick} style={{ ...chip, color: danger ? '#d9534f' : 'var(--text)' }}>
      {children}
    </button>
  )
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: 12,
}

const visChip: CSSProperties = {
  flexShrink: 0,
  fontSize: 9.5,
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
}

const chip: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface2)',
}
