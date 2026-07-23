// ─────────────────────────────────────────────────────────────────────────
// /feed — the social feed (social-feed cp05; Recipe App Redesign).
//
// Keyset-paged GET /feed via useFeed (useInfiniteQuery), split into two tabs
// (feed-tabs addition, 2026-07-22) that map onto the backend's ?scope= modes:
//   • For You — every public recipe by others (scope=forYou), TikTok-FYP-style.
//   • Following — followed authors only, no fallback (scope=following); empty
//     renders a follow prompt.
// Two presentations of the same data + social wiring:
//   • Desktop (design 2b): a centered column of FeedPostCards plus a discovery
//     right rail (cooks + trending tags, both derived from the feed; For You
//     suggests only not-yet-followed cooks, Following lists "Cooks you follow").
//   • Mobile (design 1e): an immersive, full-bleed scroll-snap feed
//     (ImmersiveFeedCard) with the tab switcher floated on top.
// Both share the optimistic like/save through useSocialMutations and the same
// comment affordance (page tracks which card's comments are open). Empty /
// error / loading use the shared StateBlock.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedPostCard from '@/components/FeedPostCard'
import ImmersiveFeedCard from '@/components/ImmersiveFeedCard'
import Avatar from '@/components/Avatar'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFeed } from '@/hooks/useFeed'
import { useFollowList } from '@/hooks/useFollowList'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import type { FeedItemResponse, FeedScope, UserSummaryResponse } from '@/api/social'

export default function FeedPage() {
  const navigate = useNavigate()
  const openRecipe = useOpenRecipe()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
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
  const { toggleLike, toggleSave } = useSocialMutations()
  const { requireAuth } = useAuthGate()
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null)

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

  const cardProps = (item: FeedItemResponse) => ({
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

  // ── Desktop: centered feed column + discovery right rail (design 2b) ────────
  return (
    <div className="scroll" style={{ position: 'absolute', inset: 0, bottom: 'var(--nav-h, 74px)', overflowY: 'auto', padding: '28px 30px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>Feed</div>
        <FeedTabs tab={tab} onSelect={selectTab} />
      </div>

      {stateBlock ? (
        stateBlock
      ) : (
        <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 620, margin: '0 auto' }}>
            {items.map((item) => (
              <FeedPostCard key={item.recipe.id} item={item} {...cardProps(item)} />
            ))}
            {loadMore}
          </div>
          <DiscoveryRail items={items} tab={tab} onOpenAuthor={(id) => navigate(`/users/${id}`)} />
        </div>
      )}
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
    <div role="tablist" aria-label="Feed" style={{ display: 'flex', gap: immersive ? 18 : 20 }}>
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

// ── Desktop discovery rail — cooks + trending tags, both derived from the ────
// feed. Per-tab framing: For You suggests cooks the caller does NOT already
// follow; Following relabels to the cooks whose posts fill that tab.

function DiscoveryRail({
  items,
  tab,
  onOpenAuthor,
}: {
  items: FeedItemResponse[]
  tab: FeedScope
  onOpenAuthor: (id: string) => void
}) {
  const { user } = useAuth()
  // The caller's follow list, only needed to filter For You suggestions —
  // Following-tab authors are followed by definition.
  const followList = useFollowList(user?.userId, 'following', tab === 'forYou')
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = followList
  useEffect(() => {
    if (tab === 'forYou' && hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [tab, hasNextPage, isFetchingNextPage, fetchNextPage])

  const followedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const page of followList.data?.pages ?? []) {
      for (const u of page.items) ids.add(u.id)
    }
    return ids
  }, [followList.data])

  const cooks = useMemo(() => {
    const seen = new Map<string, UserSummaryResponse>()
    for (const item of items) {
      if (tab === 'forYou' && followedIds.has(item.author.id)) continue
      if (!seen.has(item.author.id)) seen.set(item.author.id, item.author)
    }
    return Array.from(seen.values()).slice(0, 5)
  }, [items, tab, followedIds])

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      for (const t of item.recipe.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t)
  }, [items])

  if (cooks.length === 0 && tags.length === 0) return null

  return (
    <aside style={{ width: 300, flexShrink: 0 }}>
      {cooks.length > 0 && (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>
            {tab === 'following' ? 'Cooks you follow' : 'Suggested cooks'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            {cooks.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar username={c.username} profileImageUrl={c.profileImageUrl} seed={c.id} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.username}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>In your feed</div>
                </div>
                <button
                  onClick={() => onOpenAuthor(c.id)}
                  style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--tagborder)', borderRadius: 999, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tags.length > 0 && (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Trending tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tagcol)', background: 'var(--tagbg)', border: '1px solid var(--tagborder)', borderRadius: 999, padding: '7px 13px' }}>
                #{t}
              </span>
            ))}
          </div>
        </>
      )}
    </aside>
  )
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
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}
