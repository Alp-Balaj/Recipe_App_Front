// ─────────────────────────────────────────────────────────────────────────
// The full-width feed post card (social-feed cp05) — anatomy straight from
// the dark inspiration shot: author header, edge-to-edge photo (gradient
// fallback) with a time chip, the like/comment/share/save action row, then
// title + truncated description linking to /recipes/:id.
//
// Presentational: like/save state and counts come from the cached feed
// envelope via props; the page wires useSocialMutations. Share is owned here
// (pure browser API — Web Share with clipboard fallback + a transient flash).
// cp06: the comment affordance is live — it opens the comment sheet (mobile
// bottom sheet) or an inline panel under the action row (desktop).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { FeedItemResponse } from '@/api/social'
import Avatar from '@/components/Avatar'
import { CommentSheet, CommentsPanel } from '@/components/CommentsPanel'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { resolveImageUrl } from '@/lib/images'
import { shareLink } from '@/lib/share'
import { timeAgo } from '@/lib/time'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

interface FeedPostCardProps {
  item: FeedItemResponse
  /** Open the recipe detail (/recipes/:id). */
  onOpen: () => void
  /** Open the author's profile (/users/:id). */
  onOpenAuthor: () => void
  /** Toggle like to the given desired state (optimistic upstream). */
  onToggleLike: (next: boolean) => void
  /** Toggle save to the given desired state (optimistic upstream). */
  onToggleSave: (next: boolean) => void
  /** Whether this card's comments are open (page-level: one card at a time). */
  commentsOpen: boolean
  /** Toggle this card's comments open/closed. */
  onToggleComments: () => void
}

export default function FeedPostCard({
  item,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  commentsOpen,
  onToggleComments,
}: FeedPostCardProps) {
  const { recipe, author, likeCount, commentCount, likedByMe, savedByMe } = item
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  return (
    <article
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 22,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* Author header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
        <Avatar username={author.username} profileImageUrl={author.profileImageUrl} seed={author.id} />
        <button onClick={onOpenAuthor} style={authorBtn}>
          {author.username}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
          {timeAgo(recipe.createdAt)}
        </span>
      </div>

      {/* Photo (or gradient fallback) with the time chip. Clicking it opens the
          detail too, but the accessible link lives on the body below. */}
      <div
        onClick={onOpen}
        style={{
          position: 'relative',
          height: 230,
          cursor: 'pointer',
          ...(recipe.imageUrl
            ? {
                backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: gradientFor(recipe.id || recipe.title) }),
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            fontSize: 11.5,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(0, 0, 0, 0.55)',
            color: '#fff',
          }}
        >
          ◷ {formatMinutes(recipe.totalTimeMinutes)}
        </span>
      </div>

      {/* Action row — like / comment (display-only until cp06) / share / save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 8px 0' }}>
        <button
          onClick={() => onToggleLike(!likedByMe)}
          aria-pressed={likedByMe}
          aria-label={likedByMe ? 'Unlike' : 'Like'}
          style={{ ...actionBtn, color: likedByMe ? 'var(--accent)' : 'var(--muted)' }}
        >
          <span style={{ fontSize: 17 }}>{likedByMe ? '♥' : '♡'}</span> {likeCount}
        </button>

        <button
          onClick={onToggleComments}
          aria-label={`${commentCount} comments`}
          aria-expanded={commentsOpen}
          style={{ ...actionBtn, color: commentsOpen ? 'var(--accent)' : 'var(--muted)' }}
        >
          <span style={{ fontSize: 16 }}>◌</span> {commentCount}
        </button>

        <ShareButton title={recipe.title} recipeId={recipe.id} />

        <button
          onClick={() => onToggleSave(!savedByMe)}
          aria-pressed={savedByMe}
          aria-label={savedByMe ? 'Remove from saved' : 'Save recipe'}
          style={{
            ...actionBtn,
            marginLeft: 'auto',
            color: savedByMe ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          <span style={{ fontSize: 16 }}>{savedByMe ? '⚑' : '⚐'}</span> {savedByMe ? 'Saved' : 'Save'}
        </button>
      </div>

      {/* Body — the accessible link to the recipe detail. */}
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
        style={{ cursor: 'pointer', padding: '6px 14px 14px' }}
      >
        <div style={{ fontSize: 17, fontWeight: 800 }}>{recipe.title}</div>
        <div
          style={{
            fontSize: 13.5,
            color: 'var(--muted)',
            lineHeight: 1.45,
            marginTop: 3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {recipe.description}
        </div>
      </div>

      {/* Comments — desktop: inline panel under the card body; mobile: bottom
          sheet (the light-shot testimonial rows live in CommentsPanel). */}
      {commentsOpen &&
        (isDesktop ? (
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px 14px' }}>
            <CommentsPanel recipeId={recipe.id} recipeAuthorId={recipe.createdByUserId} />
          </div>
        ) : (
          <CommentSheet
            recipeId={recipe.id}
            recipeAuthorId={recipe.createdByUserId}
            onClose={onToggleComments}
          />
        ))}
    </article>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ShareButton({ title, recipeId }: { title: string; recipeId: string }) {
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
    <button onClick={share} aria-label="Share recipe" style={{ ...actionBtn, color: 'var(--muted)' }}>
      <span style={{ fontSize: 15 }}>↗</span> {label}
    </button>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

const actionBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  padding: '7px 9px',
  borderRadius: 10,
}

const authorBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14.5,
  fontWeight: 800,
  color: 'var(--text)',
  padding: 0,
  letterSpacing: '-0.01em',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
