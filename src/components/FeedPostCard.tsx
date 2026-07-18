// ─────────────────────────────────────────────────────────────────────────
// The full-width feed post card (social-feed cp05) — anatomy straight from
// the dark inspiration shot: author header, edge-to-edge photo (gradient
// fallback) with a time chip, the like/comment/share/save action row, then
// title + truncated description linking to /recipes/:id.
//
// Presentational: like/save state and counts come from the cached feed
// envelope via props; the page wires useSocialMutations. Share is owned here
// (pure browser API — Web Share with clipboard fallback + a transient flash).
// The comment count is display-only until cp06's comment sheet.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { FeedItemResponse } from '@/api/social'
import { resolveImageUrl } from '@/lib/images'
import { shareLink } from '@/lib/share'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

interface FeedPostCardProps {
  item: FeedItemResponse
  /** Open the recipe detail (/recipes/:id). */
  onOpen: () => void
  /** Open the author's profile (/users/:id — a stub link until cp06). */
  onOpenAuthor: () => void
  /** Toggle like to the given desired state (optimistic upstream). */
  onToggleLike: (next: boolean) => void
  /** Toggle save to the given desired state (optimistic upstream). */
  onToggleSave: (next: boolean) => void
}

export default function FeedPostCard({ item, onOpen, onOpenAuthor, onToggleLike, onToggleSave }: FeedPostCardProps) {
  const { recipe, author, likeCount, commentCount, likedByMe, savedByMe } = item

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

        <span aria-label={`${commentCount} comments`} style={{ ...actionBtn, cursor: 'default' }}>
          <span style={{ fontSize: 16 }}>◌</span> {commentCount}
        </span>

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
    </article>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Avatar({ username, profileImageUrl, seed }: { username: string; profileImageUrl?: string | null; seed: string }) {
  return (
    <div
      aria-hidden
      style={{
        flexShrink: 0,
        width: 32,
        height: 32,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 800,
        color: '#fff',
        ...(profileImageUrl
          ? {
              backgroundImage: `url(${resolveImageUrl(profileImageUrl)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { background: gradientFor(seed || username) }),
      }}
    >
      {profileImageUrl ? null : username.slice(0, 1).toUpperCase()}
    </div>
  )
}

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

/** "just now" / "12m ago" / "5h ago" / "3d ago" / "12 Jul". */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
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
