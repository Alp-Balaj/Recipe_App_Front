// ─────────────────────────────────────────────────────────────────────────
// Immersive mobile feed card (Recipe App Redesign, design 1e).
//
// A full-bleed, scroll-snap panel: edge-to-edge photo (gradient fallback), an
// author block + Follow pill up top, a vertical action rail (like / comment /
// save / share) on the right, and a bottom scrim with the title, description,
// and a "View recipe" CTA. It carries the EXACT same prop contract and aria
// labels as FeedPostCard so the /feed page wires either one identically and the
// social affordances behave the same — only the presentation changes.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { FeedItemResponse } from '@/api/social'
import Avatar from '@/components/Avatar'
import { CommentSheet } from '@/components/CommentsPanel'
import { resolveImageUrl } from '@/lib/images'
import { shareLink } from '@/lib/share'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

interface ImmersiveFeedCardProps {
  item: FeedItemResponse
  onOpen: () => void
  onOpenAuthor: () => void
  onToggleLike: (next: boolean) => void
  onToggleSave: (next: boolean) => void
  commentsOpen: boolean
  onToggleComments: () => void
}

export default function ImmersiveFeedCard({
  item,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  commentsOpen,
  onToggleComments,
}: ImmersiveFeedCardProps) {
  const { recipe, author, likeCount, commentCount, likedByMe, savedByMe } = item

  const bg = recipe.imageUrl
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.28), rgba(0,0,0,0) 30%), url(${resolveImageUrl(recipe.imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: gradientFor(recipe.id || recipe.title) }

  return (
    <section
      style={{
        position: 'relative',
        height: '100%',
        minHeight: 0,
        flex: '0 0 100%',
        scrollSnapAlign: 'start',
        scrollSnapStop: 'always',
        overflow: 'hidden',
        ...bg,
      }}
    >
      {/* Author block */}
      <div style={{ position: 'absolute', top: 18, left: 16, right: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onOpenAuthor} aria-label={author.username} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', minWidth: 0 }}>
          <span style={{ border: '2px solid rgba(255,255,255,.85)', borderRadius: '50%', display: 'flex', flexShrink: 0 }}>
            <Avatar username={author.username} profileImageUrl={author.profileImageUrl} seed={author.id} size={36} />
          </span>
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {author.username}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'rgba(255,255,255,.82)', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>
              @{author.username}
            </span>
          </span>
        </button>
        <button
          onClick={onOpenAuthor}
          style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#fff', background: 'transparent', border: '1.5px solid rgba(255,255,255,.7)', borderRadius: 999, padding: '5px 13px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Follow
        </button>
      </div>

      {/* Action rail */}
      <div style={{ position: 'absolute', right: 12, bottom: 210, display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
        <RailButton
          onClick={() => onToggleLike(!likedByMe)}
          ariaLabel={likedByMe ? 'Unlike' : 'Like'}
          pressed={likedByMe}
          icon={likedByMe ? '♥' : '♡'}
          label={String(likeCount)}
          active={likedByMe}
        />
        <RailButton
          onClick={onToggleComments}
          ariaLabel={`${commentCount} comments`}
          expanded={commentsOpen}
          icon="◌"
          label={String(commentCount)}
        />
        <SaveRailButton saved={savedByMe} onClick={() => onToggleSave(!savedByMe)} />
        <ShareRailButton title={recipe.title} recipeId={recipe.id} />
      </div>

      {/* Bottom scrim: tags + title + description + CTA */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '80px 18px 26px',
          background: 'linear-gradient(to top, rgba(8,5,3,.94) 14%, transparent)',
        }}
      >
        <div style={{ display: 'flex', gap: 7, marginBottom: 9 }}>
          <span style={pillChip}>◷ {formatMinutes(recipe.totalTimeMinutes)}</span>
          <span style={pillChip}>{recipe.difficulty}</span>
        </div>
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
          style={{ cursor: 'pointer' }}
        >
          <div style={{ fontSize: 23, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>{recipe.title}</div>
          <div
            style={{
              fontSize: 13,
              color: 'rgba(255,255,255,.8)',
              marginTop: 4,
              lineHeight: 1.45,
              maxWidth: '82%',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {recipe.description}
          </div>
        </div>
        <button
          onClick={onOpen}
          style={{ marginTop: 15, display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--accent)', color: '#1a1207', fontSize: 13.5, fontWeight: 800, padding: '11px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          View recipe ›
        </button>
      </div>

      {commentsOpen && (
        <CommentSheet recipeId={recipe.id} recipeAuthorId={recipe.createdByUserId} onClose={onToggleComments} />
      )}
    </section>
  )
}

// ── Rail pieces ──────────────────────────────────────────────────────────────

function RailButton({
  onClick,
  ariaLabel,
  icon,
  label,
  active,
  pressed,
  expanded,
}: {
  onClick: () => void
  ariaLabel: string
  icon: string
  label: string
  active?: boolean
  pressed?: boolean
  expanded?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      aria-expanded={expanded}
      style={railBtn}
    >
      <span style={{ fontSize: 29, textShadow: '0 2px 6px rgba(0,0,0,.5)', color: active ? 'var(--accent)' : '#fff' }}>{icon}</span>
      <span style={railLabel}>{label}</span>
    </button>
  )
}

function SaveRailButton({ saved, onClick }: { saved: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={saved ? 'Remove from saved' : 'Save recipe'} aria-pressed={saved} style={railBtn}>
      <span style={{ fontSize: 26, textShadow: '0 2px 6px rgba(0,0,0,.5)', color: saved ? 'var(--accent)' : '#fff' }}>{saved ? '⚑' : '⚐'}</span>
      <span style={railLabel}>{saved ? 'Saved' : 'Save'}</span>
    </button>
  )
}

function ShareRailButton({ title, recipeId }: { title: string; recipeId: string }) {
  const [flash, setFlash] = useState<'idle' | 'copied' | 'shared' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])

  const share = async () => {
    const outcome = await shareLink(title, `${window.location.origin}/recipes/${recipeId}`)
    if (outcome === 'dismissed') return
    setFlash(outcome === 'shared' ? 'shared' : outcome === 'copied' ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setFlash('idle'), 1800)
  }

  const label =
    flash === 'copied' ? 'Link copied' : flash === 'shared' ? 'Shared' : flash === 'failed' ? 'Copy failed' : 'Share'

  return (
    <button onClick={share} aria-label="Share recipe" style={railBtn}>
      <span style={{ fontSize: 25, textShadow: '0 2px 6px rgba(0,0,0,.5)', color: '#fff' }}>↗</span>
      <span style={railLabel}>{label}</span>
    </button>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const railBtn: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
}

const railLabel: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: '#fff',
  textShadow: '0 1px 3px rgba(0,0,0,.6)',
}

const pillChip: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  color: '#f2cfa6',
  border: '1px solid rgba(240,164,92,.45)',
  padding: '3px 10px',
  borderRadius: 999,
}
