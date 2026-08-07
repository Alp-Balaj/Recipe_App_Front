// ─────────────────────────────────────────────────────────────────────────
// The one recipe card, shared across every surface (fe · consolidation).
//
// Before: three divergent copies — BrowsePage's RecipeCard, MyRecipesPage's
// MyRecipeCard, and chat's SuggestionCard — with inconsistent time formatting
// ("1 h 5 min" vs "65 min"), three different gradient fallbacks (one with
// green/teal outside the warm family), and only the chat one keyboard-operable.
//
// Now: one component driven by RecipeResponse, with the surface picked by
// `variant`. Every variant formats time via formatMinutes and falls back to the
// single shared gradientFor, and every variant's clickable root is keyboard-
// operable (role="link" + tabIndex + Enter/Space), matching the old SuggestionCard.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import type { RecipeResponse } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'
import { label } from '@/api/vocabulary'

/**
 * Discover redesign (editorial front page) adds two ADDITIVE variants rather
 * than a second card component: the sections below the hero are a new LAYOUT of
 * the same RecipeResponse, and the consolidation this file exists to protect is
 * exactly the thing a "just for Discover" card would undo.
 *
 *   editorialLead — one text-over-image card heading a section
 *   editorialRow  — the dense thumbnail rows under it
 *
 * Both take `dense` for the desktop three-column scale, and both let the caller
 * replace the meta line (From-your-people rows show an author, not a time).
 */
type RecipeCardVariant = 'browse' | 'mine' | 'suggestion' | 'editorialLead' | 'editorialRow'

/**
 * Optional like/save affordances (social-feed cp06, ADDITIVE — cards without
 * this prop render exactly as before). State comes from the decision-I3
 * SocialEnvelope seam, so counts/flags may be null (= unknown on this
 * surface): unknown flags render as "not yet", unknown counts are hidden.
 */
export interface RecipeCardSocial {
  likeCount: number | null
  likedByMe: boolean | null
  savedByMe: boolean | null
  onToggleLike: (next: boolean) => void
  onToggleSave: (next: boolean) => void
}

interface RecipeCardProps {
  recipe: RecipeResponse
  variant: RecipeCardVariant
  /** Activate the card — navigate to the recipe detail. */
  onOpen: () => void
  /** Owner action (variant="mine"): opens the edit overlay. */
  onEdit?: () => void
  /** Owner action (variant="mine"): opens the delete confirmation. */
  onDelete?: () => void
  /** Like/save action row (browse-style cards; cp06). */
  social?: RecipeCardSocial
  /**
   * Editorial variants only: replaces the default "20 min · Easy" meta line.
   * "From your people" passes an avatar + name + relative time instead.
   */
  meta?: ReactNode
  /** Editorial lead only: the pill in the image's top-left (e.g. "15 min"). */
  badge?: ReactNode
  /** Editorial variants only: the tighter desktop three-column scale. */
  dense?: boolean
}

const tagBadgeStyle = { background: 'var(--tagbg)', borderColor: 'var(--tagborder)', color: 'var(--tagcol)' } as const

/** Props that make any element an accessible, keyboard-operable link to the detail route. */
function linkProps(recipe: RecipeResponse, onOpen: () => void) {
  return {
    role: 'link' as const,
    tabIndex: 0,
    'aria-label': recipe.title,
    onClick: onOpen,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    },
  }
}

/** The image (or gradient fallback) banner shared by the browse + mine cards. */
// cp07: imageUrl goes through resolveImageUrl — cp04 uploads return RELATIVE
// urls (/images/…) that must be fetched via the /api proxy prefix.
function Banner({ recipe, height = 104 }: { recipe: RecipeResponse; height?: number }) {
  return <div style={{ height, ...imageBackground(recipe) }} />
}

/** center/cover the recipe photo, or the deterministic warm gradient fallback. */
function imageBackground(recipe: RecipeResponse): CSSProperties {
  return recipe.imageUrl
    ? {
        backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: gradientFor(recipe.id || recipe.title) }
}

export default function RecipeCard({
  recipe,
  variant,
  onOpen,
  onEdit,
  onDelete,
  social,
  meta,
  badge,
  dense,
}: RecipeCardProps) {
  if (variant === 'suggestion') return <SuggestionCardBody recipe={recipe} onOpen={onOpen} />
  if (variant === 'editorialLead')
    return <EditorialLeadBody recipe={recipe} onOpen={onOpen} meta={meta} badge={badge} dense={dense} />
  if (variant === 'editorialRow')
    return <EditorialRowBody recipe={recipe} onOpen={onOpen} meta={meta} dense={dense} />
  return (
    <BannerCardBody recipe={recipe} variant={variant} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} social={social} />
  )
}

// ── Editorial: the lead image card + the rows under it ──────────────────────

/** "20 min · Easy" — what an editorial card says when the caller says nothing. */
function editorialMeta(recipe: RecipeResponse): string {
  const parts: string[] = []
  if (recipe.totalTimeMinutes) parts.push(formatMinutes(recipe.totalTimeMinutes))
  parts.push(recipe.difficulty)
  return parts.join(' · ')
}

function EditorialLeadBody({
  recipe,
  onOpen,
  meta,
  badge,
  dense,
}: {
  recipe: RecipeResponse
  onOpen: () => void
  meta?: ReactNode
  badge?: ReactNode
  dense?: boolean
}) {
  return (
    <div
      {...linkProps(recipe, onOpen)}
      style={{
        position: 'relative',
        height: dense ? 150 : 180,
        borderRadius: dense ? 16 : 18,
        overflow: 'hidden',
        cursor: 'pointer',
        marginBottom: dense ? 6 : 8,
        ...imageBackground(recipe),
      }}
    >
      {badge != null && (
        <span
          style={{
            position: 'absolute',
            top: 9,
            left: 9,
            borderRadius: 999,
            padding: '3px 9px',
            fontSize: 10.5,
            fontWeight: 800,
            background: 'var(--tagbg)',
            color: 'var(--tagcol)',
          }}
        >
          {badge}
        </span>
      )}
      {/* The scrim is a fixed dark ramp, not a token: it sits on a photograph,
          so it has to hold white text in either theme. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: dense ? '30px 12px 11px' : '34px 13px 13px',
          background: 'linear-gradient(180deg, rgba(42,38,29,0) 0%, rgba(42,38,29,0.82) 70%)',
          color: '#fffef9',
        }}
      >
        <div style={{ fontSize: dense ? 14 : 15, fontWeight: 800 }}>{recipe.title}</div>
        <div style={{ fontSize: dense ? 11 : 11.5, color: 'rgba(255,254,249,0.8)', marginTop: 2 }}>
          {meta ?? editorialMeta(recipe)}
        </div>
      </div>
    </div>
  )
}

function EditorialRowBody({
  recipe,
  onOpen,
  meta,
  dense,
}: {
  recipe: RecipeResponse
  onOpen: () => void
  meta?: ReactNode
  dense?: boolean
}) {
  const thumb = dense ? 52 : 58
  return (
    <div
      {...linkProps(recipe, onOpen)}
      style={{
        display: 'flex',
        gap: dense ? 11 : 12,
        alignItems: 'center',
        padding: dense ? '8px 0' : '9px 0',
        cursor: 'pointer',
      }}
    >
      <div style={{ width: thumb, height: thumb, borderRadius: 12, flexShrink: 0, ...imageBackground(recipe) }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: dense ? 13.5 : 14.5, fontWeight: 800 }}>{recipe.title}</div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: dense ? 11.5 : 12,
            color: 'var(--muted)',
            marginTop: 2,
          }}
        >
          {meta ?? editorialMeta(recipe)}
        </div>
      </div>
      {/* The chevron is mobile-only: the desktop columns are narrow enough that
          it would eat title width for an affordance the whole row already has. */}
      {!dense && <div style={{ color: 'var(--muted)' }}>›</div>}
    </div>
  )
}

// ── Browse + mine: the vertical banner card ─────────────────────────────────

function BannerCardBody({
  recipe,
  variant,
  onOpen,
  onEdit,
  onDelete,
  social,
}: {
  recipe: RecipeResponse
  variant: 'browse' | 'mine'
  onOpen: () => void
  onEdit?: () => void
  onDelete?: () => void
  social?: RecipeCardSocial
}) {
  const isMine = variant === 'mine'

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: isMine ? 20 : 22,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* Clickable region — the banner + text. Owner buttons live outside it so
          they're not nested inside the link. */}
      <div {...linkProps(recipe, onOpen)} style={{ cursor: 'pointer' }}>
        <Banner recipe={recipe} />

        <div style={{ padding: isMine ? '14px 16px 6px' : '15px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{recipe.title}</div>
            {isMine && (
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: 'var(--chipbg)',
                  color: 'var(--chipcol)',
                }}
              >
                {recipe.visibility === 'FriendsOnly' ? 'Friends' : recipe.visibility}
              </span>
            )}
          </div>

          <div
            style={{
              fontSize: 13.5,
              color: 'var(--muted)',
              lineHeight: 1.45,
              margin: '4px 0 12px',
              ...(isMine
                ? {}
                : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
            }}
          >
            {recipe.description}
          </div>

          {/* Stats — time (formatMinutes) + calories, then a variant-specific third stat. */}
          <div
            style={{
              display: 'flex',
              gap: 14,
              fontSize: 12.5,
              color: 'var(--muted)',
              paddingBottom: 12,
              borderBottom: '1px solid var(--hair)',
              ...(isMine ? {} : { marginBottom: 12 }),
            }}
          >
            <span>◷ {formatMinutes(recipe.totalTimeMinutes)}</span>
            {recipe.caloriesPerServing != null && <span>♨ {recipe.caloriesPerServing} kcal</span>}
            {isMine ? <span>▤ {recipe.ingredients.length}</span> : recipe.cuisineType && <span>{label(recipe.cuisineType)}</span>}
          </div>

          {/* Browse only: up to 3 tags + a "View ›" affordance. */}
          {!isMine && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
                {recipe.tags.slice(0, 3).map((t) => (
                  <Badge key={t} variant="outline" className="text-[11.5px] font-normal" style={tagBadgeStyle}>
                    {label(t)}
                  </Badge>
                ))}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>View ›</span>
            </div>
          )}
        </div>
      </div>

      {/* Mine only: owner Edit / Delete affordances (outside the link region). */}
      {isMine && (
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px 14px' }}>
          <OwnerButton onClick={onEdit}>Edit</OwnerButton>
          <OwnerButton onClick={onDelete} danger>
            Delete
          </OwnerButton>
        </div>
      )}

      {/* cp06: like/save action row (outside the link region, same aria idiom
          as the feed card). Rendered only when the surface passes `social`. */}
      {social && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 8px' }}>
          <button
            onClick={() => social.onToggleLike(!social.likedByMe)}
            aria-pressed={social.likedByMe === true}
            aria-label={social.likedByMe ? 'Unlike' : 'Like'}
            style={{ ...socialBtn, color: social.likedByMe ? 'var(--accent)' : 'var(--muted)' }}
          >
            <span style={{ fontSize: 16 }}>{social.likedByMe ? '♥' : '♡'}</span>
            {social.likeCount !== null && <span>{social.likeCount}</span>}
          </button>
          <button
            onClick={() => social.onToggleSave(!social.savedByMe)}
            aria-pressed={social.savedByMe === true}
            aria-label={social.savedByMe ? 'Remove from saved' : 'Save recipe'}
            style={{
              ...socialBtn,
              marginLeft: 'auto',
              color: social.savedByMe ? 'var(--accent)' : 'var(--muted)',
            }}
          >
            <span style={{ fontSize: 15 }}>{social.savedByMe ? '⚑' : '⚐'}</span>
            {social.savedByMe ? 'Saved' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

const socialBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  padding: '7px 9px',
  borderRadius: 10,
}

function OwnerButton({ children, onClick, danger }: { children: ReactNode; onClick?: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--border)',
        borderRadius: 11,
        padding: '8px 14px',
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 700,
        background: 'var(--surface2)',
        color: danger ? '#d9534f' : 'var(--text)',
      }}
    >
      {children}
    </button>
  )
}

// ── Suggestion: the compact horizontal card inside a chat message ────────────

function SuggestionCardBody({ recipe, onOpen }: { recipe: RecipeResponse; onOpen: () => void }) {
  return (
    <div
      {...linkProps(recipe, onOpen)}
      style={{
        cursor: 'pointer',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 18,
        padding: 14,
        display: 'flex',
        gap: 13,
        alignItems: 'center',
        marginBottom: 11,
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 48,
          height: 48,
          borderRadius: 14,
          // cp07: relative cp04 upload urls resolve through the /api prefix.
          background: recipe.imageUrl
            ? `center / cover no-repeat url(${resolveImageUrl(recipe.imageUrl)})`
            : gradientFor(recipe.id || recipe.title),
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{recipe.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 7px' }}>{dietLine(recipe)}</div>
        {recipe.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {recipe.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px] font-normal py-0.5 px-2.5" style={tagBadgeStyle}>
                {label(tag)}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 18 }}>›</div>
    </div>
  )
}

/** A compact "30 min · 420 kcal · Easy · Japanese" summary line for the suggestion card. */
function dietLine(recipe: RecipeResponse): string {
  const parts: string[] = []
  if (recipe.totalTimeMinutes) parts.push(formatMinutes(recipe.totalTimeMinutes))
  if (recipe.caloriesPerServing != null) parts.push(`${recipe.caloriesPerServing} kcal`)
  parts.push(recipe.difficulty)
  if (recipe.cuisineType) parts.push(label(recipe.cuisineType))
  return parts.join(' · ')
}
