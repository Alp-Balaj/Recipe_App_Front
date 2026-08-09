// ─────────────────────────────────────────────────────────────────────────
// /feed — the social feed (social-feed cp05; Recipe App Redesign).
//
// Keyset-paged GET /feed via useFeed (useInfiniteQuery), split into two tabs
// (feed-tabs addition, 2026-07-22) that map onto the backend's ?scope= modes:
//   • For You — every public recipe by others (scope=forYou), TikTok-FYP-style.
//   • Following — followed authors only, no fallback (scope=following); empty
//     renders a follow prompt.
// Two presentations of the same data + social wiring:
//   • Desktop (feed redesign, 2026-08-09) — an editorial page, a sibling of the
//     redesigned Discover: a dated masthead, Fraunces section headings with
//     rules, and a rhythm of hero → 2-up grid → horizontal post per page of
//     four, beside a sticky rail whose four modules each do a real job.
//   • Mobile (design 1e): an immersive, full-bleed scroll-snap feed
//     (ImmersiveFeedCard) with the tab switcher floated on top. UNCHANGED by
//     the redesign — the desktop rework stops at the isDesktop branch.
// Both share the optimistic like/save through useSocialMutations and the same
// comment affordance (page tracks which card's comments are open). Empty /
// error / loading use the shared StateBlock.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedPostCard, { type FeedCardVariant } from '@/components/FeedPostCard'
import FeedRail from '@/components/feed/FeedRail'
import ImmersiveFeedCard from '@/components/ImmersiveFeedCard'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFeed } from '@/hooks/useFeed'
import { useFollowedIds } from '@/hooks/useFollowedIds'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import type { FeedItemResponse, FeedScope } from '@/api/social'

/**
 * The desktop rhythm: each page of the feed is laid out hero → two grid cards →
 * one horizontal card, then repeats. It is a cycle rather than a one-off so a
 * "Load more" doesn't dump an undifferentiated stack under the composed first
 * screen — every batch gets the same editorial shape.
 */
const CYCLE: FeedCardVariant[] = ['hero', 'grid', 'grid', 'horizontal']

/**
 * The per-item wiring both card families share (the immersive mobile card takes
 * the same set). Named so the column below can pass it through without the
 * props widening to `unknown`.
 */
type CardWiring = Pick<
  ComponentProps<typeof FeedPostCard>,
  'onOpen' | 'onOpenAuthor' | 'onToggleLike' | 'onToggleSave' | 'commentsOpen' | 'onToggleComments'
>

export default function FeedPage() {
  const navigate = useNavigate()
  const openRecipe = useOpenRecipe()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  // The rail is the first thing to go when the pane narrows — never the hero.
  // 252px sidebar + ~1180px of pane is where the three-column reading breaks.
  const hasRoomForRail = useMediaQuery('(min-width: 1432px)')
  const { user } = useAuth()
  const [tab, setTab] = useState<FeedScope>('forYou')
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useFeed(tab)
  const { toggleLike, toggleSave, toggleFollow } = useSocialMutations()
  const { requireAuth } = useAuthGate()
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null)

  // Who the caller already follows — the hero's Follow/Following pill and the
  // rail's suggestions must not disagree, so one source feeds both. Only worth
  // walking on desktop, where something renders it.
  const followedIds = useFollowedIds(isDesktop && !!user)

  const selectTab = (next: FeedScope) => {
    if (next === tab) return
    // Guest access (D3): the Following tab stays visible but is account-only —
    // a guest tap opens the login prompt and stays on For You.
    if (next === 'following' && !requireAuth()) return
    setTab(next)
    setOpenCommentsId(null)
  }

  // Flatten pages, de-duping by recipe id (defensive against cursor-edge overlap).
  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: FeedItemResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.recipe.id)) {
          seen.add(item.recipe.id)
          out.push(item)
        }
      }
    }
    return out
  }, [data])

  const cardProps = (item: FeedItemResponse): CardWiring => ({
    // The feed stays behind the canvas — see recipeCanvas.ts.
    onOpen: () => openRecipe(item.recipe.id),
    onOpenAuthor: () => navigate(`/users/${item.author.id}`),
    // Guest access (§4.4): the gate short-circuits BEFORE .mutate, so the
    // optimistic cache patches never run for a guest.
    onToggleLike: (next: boolean) => {
      if (!requireAuth()) return
      toggleLike.mutate({ recipeId: item.recipe.id, next })
    },
    onToggleSave: (next: boolean) => {
      if (!requireAuth()) return
      toggleSave.mutate({ recipeId: item.recipe.id, next })
    },
    commentsOpen: openCommentsId === item.recipe.id,
    onToggleComments: () =>
      setOpenCommentsId((cur) => (cur === item.recipe.id ? null : item.recipe.id)),
  })

  const onToggleFollow = (userId: string, next: boolean) => {
    if (!requireAuth()) return
    toggleFollow.mutate({ userId, next })
  }

  const loadMore = (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 14px' }}>
      {hasNextPage ? (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
          style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      ) : (
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {isFetching ? 'Loading…' : "You're all caught up."}
        </span>
      )}
    </div>
  )

  const stateBlock = isLoading ? (
    <StateBlock title="Loading your feed…" body="Checking what the kitchen has been up to." />
  ) : isError ? (
    <StateBlock
      title="Couldn't load the feed"
      body="Something went wrong reaching the kitchen. Check your connection and try again."
      action={{ label: 'Try again', onClick: () => refetch() }}
    />
  ) : items.length === 0 ? (
    tab === 'following' ? (
      <StateBlock
        title="Nothing cooking yet"
        body="Recipes from cooks you follow land here. Browse Discover and follow some cooks to fill this feed."
        action={{ label: 'Browse recipes', onClick: () => navigate('/discover') }}
      />
    ) : (
      <StateBlock
        title="Nothing cooking yet"
        body="No public recipes to show yet — be the first to share one from your kitchen."
        action={{ label: 'New recipe', onClick: () => navigate('/recipes/new') }}
      />
    )
  ) : null

  // ── Mobile: immersive full-bleed scroll-snap feed (design 1e) ──────────────
  if (!isDesktop) {
    if (stateBlock) {
      return (
        <div className="scroll" style={{ ...mobilePad, overflowY: 'auto' }}>
          <FeedHeading tab={tab} />
          <div style={{ marginBottom: 18 }}>
            <FeedTabs tab={tab} onSelect={selectTab} />
          </div>
          {stateBlock}
        </div>
      )
    }
    return (
      <div style={{ position: 'absolute', inset: 0, bottom: 'var(--nav-h, 74px)', display: 'flex', flexDirection: 'column', background: '#000' }}>
        {/* TikTok-style floating switcher, centered over the immersive cards. */}
        <div style={{ position: 'absolute', top: 10, left: 0, right: 0, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <FeedTabs tab={tab} onSelect={selectTab} immersive />
          </div>
        </div>
        <div
          className="scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {items.map((item) => (
            <ImmersiveFeedCard key={item.recipe.id} item={item} {...cardProps(item)} />
          ))}
          <div style={{ flex: '0 0 auto', scrollSnapAlign: 'start', padding: '24px 18px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg)' }}>
            {loadMore}
          </div>
        </div>
      </div>
    )
  }

  // ── Desktop: the editorial page (feed redesign) ────────────────────────────
  // No pill on the caller's own post (you cannot follow yourself) and none for
  // a guest, who has no follow graph to show — an inert control reads as broken.
  const heroFollow = (item: FeedItemResponse) =>
    user && item.author.id !== user.userId
      ? {
          following: followedIds.has(item.author.id),
          onToggle: (next: boolean) => onToggleFollow(item.author.id, next),
        }
      : undefined

  return (
    <div
      className="scroll"
      style={{ position: 'absolute', inset: 0, bottom: 'var(--nav-h, 74px)', overflowY: 'auto', padding: '28px 34px 48px' }}
    >
      {/* Masthead — the same dated eyebrow Discover wears, so the two pages
          read as siblings rather than as two different products. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22 }}>
        <div style={{ ...eyebrow, flexShrink: 0 }}>FEED · {longDate(new Date())}</div>
        <div style={{ marginLeft: 'auto' }}>
          <FeedTabs tab={tab} onSelect={selectTab} />
        </div>
      </div>

      {stateBlock ? (
        stateBlock
      ) : (
        <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <FeedColumn
              items={items}
              tab={tab}
              hasNextPage={!!hasNextPage}
              loadMore={loadMore}
              cardProps={cardProps}
              heroFollow={heroFollow}
              followedCount={followedIds.size}
              onFindCooks={() => navigate('/discover')}
            />
          </div>
          {hasRoomForRail && (
            <FeedRail
              items={items}
              tab={tab}
              followedIds={followedIds}
              onOpenAuthor={(id) => navigate(`/users/${id}`)}
              onOpenRecipe={(id) => openRecipe(id)}
              onToggleFollow={onToggleFollow}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── The desktop feed column ─────────────────────────────────────────────────

/**
 * Section headings are emitted for the FIRST cycle only. Later pages continue
 * the rhythm without re-announcing "Also today" — the reader has already been
 * told what shape the page has, and repeating the labels would turn them into
 * decoration.
 */
function FeedColumn({
  items,
  tab,
  hasNextPage,
  loadMore,
  cardProps,
  heroFollow,
  followedCount,
  onFindCooks,
}: {
  items: FeedItemResponse[]
  tab: FeedScope
  hasNextPage: boolean
  loadMore: ReactNode
  cardProps: (item: FeedItemResponse) => CardWiring
  heroFollow: (item: FeedItemResponse) => { following: boolean; onToggle: (next: boolean) => void } | undefined
  followedCount: number
  onFindCooks: () => void
}) {
  const blocks: ReactNode[] = []
  let grid: ReactNode[] = []

  const flushGrid = (key: string) => {
    if (grid.length === 0) return
    blocks.push(
      <div key={`grid-${key}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginBottom: 26 }}>
        {grid}
      </div>,
    )
    grid = []
  }

  items.forEach((item, index) => {
    const slot = index % CYCLE.length
    const variant = CYCLE[slot]
    const firstCycle = index < CYCLE.length

    // Headings introduce the first cycle's three movements. The Following tab
    // frames the lead differently — it is a "since you were last here" batch,
    // not a curated selection — and carries the count chip.
    if (firstCycle && slot === 0) {
      blocks.push(
        <SectionHeading
          key="h-lead"
          label={tab === 'following' ? `New since ${lastVisitWeekday(item.recipe.createdAt)}` : 'Latest from your people'}
          chip={tab === 'following' ? `${items.length} post${items.length === 1 ? '' : 's'}` : undefined}
        />,
      )
    }
    // On Following the 2-up grid belongs to the same "new" batch as the hero,
    // so it gets no heading of its own.
    if (firstCycle && slot === 1 && tab === 'forYou') {
      flushGrid(`pre-${index}`)
      blocks.push(<SectionHeading key="h-also" label="Also today" />)
    }
    if (firstCycle && slot === 3 && tab === 'forYou') {
      flushGrid(`pre-${index}`)
      blocks.push(<SectionHeading key="h-earlier" label="Earlier this week" />)
    }

    const card = (
      <FeedPostCard
        key={item.recipe.id}
        item={item}
        variant={variant}
        {...cardProps(item)}
        {...(variant === 'hero' ? { follow: heroFollow(item) } : {})}
      />
    )

    if (variant === 'grid') {
      grid.push(card)
      return
    }
    flushGrid(`before-${index}`)
    blocks.push(
      variant === 'horizontal' ? (
        <div key={`wrap-${item.recipe.id}`} style={{ marginBottom: 26 }}>
          {card}
        </div>
      ) : (
        card
      ),
    )
  })
  flushGrid('tail')

  return (
    <>
      {blocks}
      {/* The Following tab's end of list is a destination, not a full stop: an
          exhausted followed feed is a prompt to follow more people. For You is
          effectively endless, so it keeps the plain load-more affordance. */}
      {tab === 'following' && !hasNextPage && items.length > 0 ? (
        <>
          <SectionHeading label="Caught up" />
          <CaughtUpCard followedCount={followedCount} onFindCooks={onFindCooks} />
        </>
      ) : (
        loadMore
      )}
    </>
  )
}

function SectionHeading({ label, chip }: { label: string; chip?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--text)',
        }}
      >
        {label}
      </div>
      {chip && (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 800,
            color: 'var(--accent)',
            background: 'var(--chipbg)',
            borderRadius: 999,
            padding: '4px 10px',
          }}
        >
          {chip}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function CaughtUpCard({ followedCount, onFindCooks }: { followedCount: number; onFindCooks: () => void }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '26px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'var(--text)',
            marginBottom: 6,
          }}
        >
          {followedCount > 0
            ? `That's everything from your ${followedCount} cook${followedCount === 1 ? '' : 's'}`
            : "That's everything for now"}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, maxWidth: '52ch' }}>
          Follow a few more and this tab fills up faster — or head to For You to see who else is cooking like you.
        </div>
      </div>
      <button
        onClick={onFindCooks}
        style={{
          flexShrink: 0,
          cursor: 'pointer',
          border: 'none',
          borderRadius: 13,
          padding: '12px 20px',
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: 800,
          background: 'var(--accent-fill)',
          color: 'var(--accent-ink)',
        }}
      >
        Find cooks
      </button>
    </div>
  )
}

// ── The For You / Following switcher (both layouts) ──────────────────────────

const FEED_TABS: { scope: FeedScope; label: string }[] = [
  { scope: 'forYou', label: 'For You' },
  { scope: 'following', label: 'Following' },
]

/** `immersive` restyles for the mobile full-bleed feed: white over the media. */
function FeedTabs({
  tab,
  onSelect,
  immersive,
}: {
  tab: FeedScope
  onSelect: (scope: FeedScope) => void
  immersive?: boolean
}) {
  return (
    <div role="tablist" aria-label="Feed" style={{ display: 'flex', gap: immersive ? 18 : 22 }}>
      {FEED_TABS.map(({ scope, label }) => {
        const active = scope === tab
        return (
          <button
            key={scope}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(scope)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14.5,
              fontWeight: active ? 800 : 700,
              padding: '4px 2px 6px',
              color: immersive
                ? active
                  ? '#fff'
                  : 'rgba(255,255,255,0.62)'
                : active
                  ? 'var(--text)'
                  : 'var(--muted)',
              borderBottom: active
                ? `2px solid ${immersive ? '#fff' : 'var(--accent)'}`
                : '2px solid transparent',
              textShadow: immersive ? '0 1px 10px rgba(0,0,0,0.55)' : undefined,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ── Mobile heading (only shown over the non-immersive state screens) ─────────

function FeedHeading({ tab }: { tab: FeedScope }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>Feed</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
        {tab === 'following'
          ? 'Fresh recipes from the cooks you follow.'
          : 'Fresh recipes from all over the kitchen.'}
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** "SATURDAY 9 AUGUST" — the same masthead date Discover uses. */
function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

/**
 * "New since Thursday" — anchored on the NEWEST post in the tab, which is the
 * only "since" the client can state truthfully: there is no last-visit
 * timestamp anywhere in the app, so naming one would be a guess dressed as a
 * fact. The newest post is genuinely the moment this batch starts.
 */
function lastVisitWeekday(newestCreatedAt: string): string {
  const date = new Date(newestCreatedAt)
  if (Number.isNaN(date.getTime())) return 'then'
  return date.toLocaleDateString(undefined, { weekday: 'long' })
}

// ── Inline styles ───────────────────────────────────────────────────────────

const eyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.13em',
  color: 'var(--muted)',
}

const mobilePad: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  padding: '26px 18px 16px',
}

const loadMoreBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '11px 20px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}
