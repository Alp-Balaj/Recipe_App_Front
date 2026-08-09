// ─────────────────────────────────────────────────────────────────────────
// The desktop feed post card (feed redesign, 2026-08-09 — rebuilt from the
// social-feed cp05 card).
//
// One component, three anatomies, selected by `variant`:
//   • hero        — the lead post: 330px photo, Fraunces 31 title, tag chips,
//                   the made-it row, and an always-visible inline comment
//                   strip that expands in place into the existing
//                   CommentsPanel.
//   • grid        — the 2-up follow-ups: 168px photo, Fraunces 20 title,
//                   two-line description, like/comment + save.
//   • horizontal  — the older post: 300px photo beside the body, action row
//                   pinned to the bottom.
// They are one component rather than three files because they are the same
// post with the same wiring — only the sizes and which parts are present
// differ, and splitting them would mean maintaining the like/save/share/
// comment plumbing three times.
//
// Why the old card is gone rather than kept alongside: it WAS this component
// (nothing else imported it — mobile uses ImmersiveFeedCard), so a second copy
// would have been dead code pretending to be a fallback.
//
// Still presentational: like/save state and counts come from the cached feed
// envelope via props; the page wires useSocialMutations. Share is owned here
// (pure browser API — Web Share with clipboard fallback + a transient flash).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import type { FeedItemResponse, UserSummaryResponse } from '@/api/social'
import Avatar from '@/components/Avatar'
import { CommentsPanel } from '@/components/CommentsPanel'
import { BookmarkIcon, ChatIcon, HeartIcon, ShareIcon } from '@/components/navIcons'
import { useAuth } from '@/auth/AuthContext'
import { useComments } from '@/hooks/useComments'
import { resolveImageUrl } from '@/lib/images'
import { shareLink } from '@/lib/share'
import { timeAgo } from '@/lib/time'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'

export type FeedCardVariant = 'hero' | 'grid' | 'horizontal'

interface FeedPostCardProps {
  item: FeedItemResponse
  /** Which anatomy to render — see the module header. */
  variant: FeedCardVariant
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
  /**
   * Hero only — the follow control in the header. Undefined hides it, which is
   * what a guest (who cannot follow anyone) and a not-yet-loaded follow list
   * both get: an inert pill would be worse than no pill.
   */
  follow?: { following: boolean; onToggle: (next: boolean) => void }
}

export default function FeedPostCard(props: FeedPostCardProps) {
  if (props.variant === 'grid') return <GridCard {...props} />
  if (props.variant === 'horizontal') return <HorizontalCard {...props} />
  return <HeroCard {...props} />
}

// ── Hero ────────────────────────────────────────────────────────────────────

function HeroCard({
  item,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  commentsOpen,
  onToggleComments,
  follow,
}: FeedPostCardProps) {
  const { recipe, author, likeCount, commentCount, likedByMe, savedByMe } = item

  return (
    <Card radius={22} style={{ marginBottom: 26 }}>
      {/* Header — avatar, name over the meta line, follow control. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 18px' }}>
        <Avatar username={author.username} profileImageUrl={author.profileImageUrl} seed={author.id} size={38} />
        <div style={{ minWidth: 0 }}>
          <button onClick={onOpenAuthor} style={{ ...authorBtn, fontSize: 15 }}>
            {author.username}
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            {metaLine(recipe.createdAt, recipe.totalTimeMinutes, recipe.tags[0])}
          </div>
        </div>
        {follow && (
          <button
            onClick={() => follow.onToggle(!follow.following)}
            aria-pressed={follow.following}
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              cursor: 'pointer',
              border: 'none',
              borderRadius: 999,
              padding: '7px 14px',
              fontFamily: 'inherit',
              fontSize: 12.5,
              fontWeight: 700,
              ...(follow.following
                ? { color: 'var(--accent)', background: 'var(--chipbg)' }
                : { color: 'var(--accent-ink)', background: 'var(--accent-fill)' }),
            }}
          >
            {follow.following ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      {/* Photo. The old "◷ time" chip is gone — the time is in the meta line
          above, and the chip was the only thing sitting on the photograph. */}
      <Photo recipe={recipe} height={330} onOpen={onOpen} />

      {/* Body — the accessible link to the recipe detail. */}
      <Body onOpen={onOpen} title={recipe.title} style={{ padding: '18px 22px 4px' }}>
        <div style={{ ...displayTitle, fontSize: 31, lineHeight: 1.14, letterSpacing: '-0.015em', marginBottom: 8 }}>
          {recipe.title}
        </div>
        <div style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.5, maxWidth: '62ch', textWrap: 'pretty' }}>
          {recipe.description}
        </div>
        {recipe.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--tagcol)',
                  background: 'var(--tagbg)',
                  borderRadius: 999,
                  padding: '6px 13px',
                }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </Body>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '12px 14px 10px' }}>
        <LikeButton count={likeCount} liked={likedByMe} onToggle={onToggleLike} size="lg" />
        <CommentButton count={commentCount} open={commentsOpen} onToggle={onToggleComments} size="lg" />
        <ShareButton title={recipe.title} recipeId={recipe.id} size="lg" />
        <SaveButton saved={savedByMe} onToggle={onToggleSave} size="lg" />
      </div>

      <MadeItRow
        count={item.madeItCount}
        makers={item.recentMakers}
        onOpen={onOpen}
        size="lg"
        style={{ padding: '0 22px 14px' }}
      />

      {/* Comments. The strip is the panel's COLLAPSED state, not a separate
          feature: opening swaps it for the existing CommentsPanel in place. */}
      {commentsOpen ? (
        <div style={{ borderTop: '1px solid var(--hair)', background: 'var(--bg)', padding: '12px 22px 16px' }}>
          <CommentsPanel recipeId={recipe.id} recipeAuthorId={recipe.createdByUserId} />
        </div>
      ) : (
        <InlineCommentStrip
          recipeId={recipe.id}
          commentCount={commentCount}
          onExpand={onToggleComments}
        />
      )}
    </Card>
  )
}

// ── Grid (2-up) ─────────────────────────────────────────────────────────────

function GridCard({
  item,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  commentsOpen,
  onToggleComments,
}: FeedPostCardProps) {
  const { recipe, author, likeCount, commentCount, likedByMe, savedByMe } = item

  return (
    <Card radius={20} style={{ display: 'flex', flexDirection: 'column' }}>
      <Photo recipe={recipe} height={168} onOpen={onOpen} />
      <Body onOpen={onOpen} title={recipe.title} style={{ padding: '14px 16px 6px', flex: 1 }}>
        <CompactByline author={author} recipe={recipe} onOpenAuthor={onOpenAuthor} avatarSize={24} />
        <div style={{ ...displayTitle, fontSize: 20, lineHeight: 1.18 }}>{recipe.title}</div>
        <div style={{ ...clamp2, fontSize: 13, marginTop: 5 }}>{recipe.description}</div>
      </Body>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 10px 10px' }}>
        <LikeButton count={likeCount} liked={likedByMe} onToggle={onToggleLike} size="sm" />
        <CommentButton count={commentCount} open={commentsOpen} onToggle={onToggleComments} size="sm" />
        <SaveButton saved={savedByMe} onToggle={onToggleSave} size="sm" />
      </div>
      {commentsOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 14px 14px' }}>
          <CommentsPanel recipeId={recipe.id} recipeAuthorId={recipe.createdByUserId} />
        </div>
      )}
    </Card>
  )
}

// ── Horizontal ──────────────────────────────────────────────────────────────

function HorizontalCard({
  item,
  onOpen,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  commentsOpen,
  onToggleComments,
}: FeedPostCardProps) {
  const { recipe, author, likeCount, commentCount, likedByMe, savedByMe } = item

  return (
    <Card radius={22}>
      <div style={{ display: 'flex' }}>
        <div
          onClick={onOpen}
          style={{
            flex: '0 0 300px',
            cursor: 'pointer',
            minHeight: 210,
            ...photoBackground(recipe),
          }}
        />
        <div style={{ flex: 1, minWidth: 0, padding: '18px 20px 14px', display: 'flex', flexDirection: 'column' }}>
          <Body onOpen={onOpen} title={recipe.title}>
            <CompactByline author={author} recipe={recipe} onOpenAuthor={onOpenAuthor} avatarSize={26} />
            <div style={{ ...displayTitle, fontSize: 24, lineHeight: 1.16, letterSpacing: '-0.012em', marginBottom: 7 }}>
              {recipe.title}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
              {recipe.description}
            </div>
          </Body>
          <MadeItRow
            count={item.madeItCount}
            makers={item.recentMakers}
            onOpen={onOpen}
            size="sm"
            style={{ marginTop: 14 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 'auto', paddingTop: 10 }}>
            <LikeButton count={likeCount} liked={likedByMe} onToggle={onToggleLike} size="sm" />
            <CommentButton count={commentCount} open={commentsOpen} onToggle={onToggleComments} size="sm" />
            <SaveButton saved={savedByMe} onToggle={onToggleSave} size="sm" />
          </div>
        </div>
      </div>
      {commentsOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 20px 16px' }}>
          <CommentsPanel recipeId={recipe.id} recipeAuthorId={recipe.createdByUserId} />
        </div>
      )}
    </Card>
  )
}

// ── Shared pieces ───────────────────────────────────────────────────────────

/** The card shell: surface + border + the shadow that lifts on hover. */
function Card({
  radius,
  style,
  children,
}: {
  radius: number
  style?: CSSProperties
  children: ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: hover ? '0 10px 28px -14px rgba(60,54,20,.34)' : 'var(--cardsh)',
        transition: 'box-shadow .2s',
        borderRadius: radius,
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </article>
  )
}

function photoBackground(recipe: FeedItemResponse['recipe']): CSSProperties {
  return recipe.imageUrl
    ? {
        backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: gradientFor(recipe.id || recipe.title) }
}

function Photo({
  recipe,
  height,
  onOpen,
}: {
  recipe: FeedItemResponse['recipe']
  height: number
  onOpen: () => void
}) {
  return <div onClick={onOpen} style={{ height, cursor: 'pointer', ...photoBackground(recipe) }} />
}

/**
 * The card's accessible link to the recipe detail. Kept as role="link" with
 * the title as its name — the same affordance the cp05 card exposed, and what
 * the page's navigation test drives.
 */
function Body({
  onOpen,
  title,
  style,
  children,
}: {
  onOpen: () => void
  title: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={title}
      onClick={onOpen}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </div>
  )
}

/** `author · 2h ago · 35 min` — the small cards' one-line header. */
function CompactByline({
  author,
  recipe,
  onOpenAuthor,
  avatarSize,
}: {
  author: UserSummaryResponse
  recipe: FeedItemResponse['recipe']
  onOpenAuthor: () => void
  avatarSize: number
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <Avatar username={author.username} profileImageUrl={author.profileImageUrl} seed={author.id} size={avatarSize} />
      <div style={{ fontSize: 12.5, color: 'var(--muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <button
          onClick={(e) => {
            // The byline sits inside the card's role="link" body, so the click
            // has to stop before it also opens the recipe.
            e.stopPropagation()
            onOpenAuthor()
          }}
          style={{ ...authorBtn, fontSize: 12.5, fontWeight: 700 }}
        >
          {author.username}
        </button>
        {' · '}
        {timeAgo(recipe.createdAt)} · {formatMinutes(recipe.totalTimeMinutes)}
      </div>
    </div>
  )
}

/** `2h ago · 45 min · Baking` — the hero's meta line. */
function metaLine(createdAt: string, minutes: number, firstTag?: string): string {
  return [timeAgo(createdAt), formatMinutes(minutes), firstTag].filter(Boolean).join(' · ')
}

/**
 * "N made this", with the makers' overlapping avatars. Renders nothing at zero —
 * "0 made this" is a discouragement, not information.
 *
 * The label opens the recipe rather than a photo lightbox: the design called for
 * "see their photos", but a cook log carries no photo in this model, so pointing
 * at the recipe is the honest destination. Wire it to a lightbox the day cook
 * photos exist.
 */
function MadeItRow({
  count,
  makers,
  onOpen,
  size,
  style,
}: {
  count: number
  makers: UserSummaryResponse[]
  onOpen: () => void
  size: 'lg' | 'sm'
  style?: CSSProperties
}) {
  if (count <= 0) return null
  const avatar = size === 'lg' ? 28 : 24

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, ...style }}>
      {makers.length > 0 && (
        <div style={{ display: 'flex' }}>
          {makers.map((maker, index) => (
            <div
              key={maker.id}
              style={{
                borderRadius: '50%',
                border: '2px solid var(--surface)',
                marginLeft: index === 0 ? 0 : -(avatar / 2.6),
                display: 'flex',
              }}
            >
              <Avatar username={maker.username} profileImageUrl={maker.profileImageUrl} seed={maker.id} size={avatar} />
            </div>
          ))}
        </div>
      )}
      <button
        onClick={onOpen}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: size === 'lg' ? 13.5 : 13,
          fontWeight: 700,
          color: 'var(--text)',
        }}
      >
        {count} made this
      </button>
    </div>
  )
}

/**
 * The hero's collapsed comment state: the newest comment, then a pill that
 * expands the real panel. It reads the SAME useComments cache CommentsPanel
 * does, so expanding costs no second request.
 */
function InlineCommentStrip({
  recipeId,
  commentCount,
  onExpand,
}: {
  recipeId: string
  commentCount: number
  onExpand: () => void
}) {
  const { user } = useAuth()
  // Nothing to preview when nobody has commented — don't spend a request on it.
  const { data } = useComments(recipeId, commentCount > 0)
  const top = data?.pages[0]?.items[0]

  return (
    <div style={{ borderTop: '1px solid var(--hair)', background: 'var(--bg)', padding: '14px 22px 16px' }}>
      {top && (
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 12 }}>
          <Avatar username={top.authorUsername} seed={top.authorId} size={28} />
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700 }}>{top.authorUsername}</span>{' '}
            <span style={{ color: 'var(--muted)' }}>{top.content}</span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        {user && <Avatar username={user.username} seed={user.userId} size={28} />}
        <button
          onClick={onExpand}
          aria-label={`${commentCount} comments`}
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '9px 15px',
            fontSize: 13.5,
            color: 'var(--muted)',
          }}
        >
          Add a comment…
        </button>
        {commentCount > 0 && (
          <button
            onClick={onExpand}
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              color: 'var(--muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            All {commentCount}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Action row ──────────────────────────────────────────────────────────────

/** Shared geometry for the two action-row scales (hero vs the smaller cards). */
function actionStyle(size: 'lg' | 'sm'): CSSProperties {
  return {
    ...actionBtn,
    gap: size === 'lg' ? 7 : 6,
    fontSize: size === 'lg' ? 13.5 : 13,
    padding: size === 'lg' ? '8px 11px' : '7px 9px',
    borderRadius: size === 'lg' ? 11 : 10,
  }
}

const ICON = { lg: 19, sm: 17 } as const

/** Every action button hovers to --chipbg; active like/save go --accent. */
function ActionButton({
  size,
  active,
  style,
  children,
  ...rest
}: {
  size: 'lg' | 'sm'
  active?: boolean
  style?: CSSProperties
  children: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [hover, setHover] = useState(false)
  return (
    <button
      {...rest}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...actionStyle(size),
        color: active ? 'var(--accent)' : 'var(--muted)',
        background: hover ? 'var(--chipbg)' : 'transparent',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function LikeButton({
  count,
  liked,
  onToggle,
  size,
}: {
  count: number
  liked: boolean
  onToggle: (next: boolean) => void
  size: 'lg' | 'sm'
}) {
  return (
    <ActionButton
      size={size}
      active={liked}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(!liked)
      }}
      aria-pressed={liked}
      aria-label={liked ? 'Unlike' : 'Like'}
    >
      <HeartIcon size={ICON[size]} filled={liked} /> {count}
    </ActionButton>
  )
}

function CommentButton({
  count,
  open,
  onToggle,
  size,
}: {
  count: number
  open: boolean
  onToggle: () => void
  size: 'lg' | 'sm'
}) {
  return (
    <ActionButton
      size={size}
      active={open}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={`${count} comments`}
      aria-expanded={open}
    >
      <ChatIcon size={ICON[size]} /> {count}
    </ActionButton>
  )
}

function SaveButton({
  saved,
  onToggle,
  size,
}: {
  saved: boolean
  onToggle: (next: boolean) => void
  size: 'lg' | 'sm'
}) {
  return (
    <ActionButton
      size={size}
      active={saved}
      style={{ marginLeft: 'auto' }}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(!saved)
      }}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save recipe'}
    >
      <BookmarkIcon size={ICON[size]} filled={saved} /> {saved ? 'Saved' : 'Save'}
    </ActionButton>
  )
}

function ShareButton({ title, recipeId, size }: { title: string; recipeId: string; size: 'lg' | 'sm' }) {
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
    <ActionButton
      size={size}
      onClick={(e) => {
        e.stopPropagation()
        void share()
      }}
      aria-label="Share recipe"
    >
      <ShareIcon size={ICON[size]} /> {label}
    </ActionButton>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────

/**
 * Fraunces, on recipe titles ONLY — the same rule Discover follows. It never
 * touches buttons, nav or body copy, which is what keeps the display face
 * reading as an editorial voice rather than a theme.
 */
const displayTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--text)',
  textWrap: 'pretty',
}

const clamp2: CSSProperties = {
  color: 'var(--muted)',
  lineHeight: 1.45,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const actionBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 700,
}

const authorBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 800,
  color: 'var(--text)',
  padding: 0,
  letterSpacing: '-0.01em',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
