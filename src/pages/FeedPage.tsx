// ─────────────────────────────────────────────────────────────────────────
// /feed — the social feed (social-feed cp05; Recipe App Redesign).
//
// Keyset-paged GET /feed via useFeed (useInfiniteQuery). Two presentations of
// the same data + social wiring:
//   • Desktop (design 2b): a centered column of FeedPostCards plus a discovery
//     right rail (suggested cooks + trending tags, both derived from the feed).
//   • Mobile (design 1e): an immersive, full-bleed scroll-snap feed
//     (ImmersiveFeedCard).
// Both share the optimistic like/save through useSocialMutations and the same
// comment affordance (page tracks which card's comments are open). Empty /
// error / loading use the shared StateBlock; the discover cold-start is labeled.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedPostCard from '@/components/FeedPostCard'
import ImmersiveFeedCard from '@/components/ImmersiveFeedCard'
import Avatar from '@/components/Avatar'
import StateBlock from '@/components/ui/StateBlock'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useFeed } from '@/hooks/useFeed'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import type { FeedItemResponse, UserSummaryResponse } from '@/api/social'

export default function FeedPage() {
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useFeed()
  const { toggleLike, toggleSave } = useSocialMutations()
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null)

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

  const source = data?.pages[0]?.source
  const isDiscover = source === 'discover'

  const cardProps = (item: FeedItemResponse) => ({
    onOpen: () => navigate(`/recipes/${item.recipe.id}`),
    onOpenAuthor: () => navigate(`/users/${item.author.id}`),
    onToggleLike: (next: boolean) => toggleLike.mutate({ recipeId: item.recipe.id, next }),
    onToggleSave: (next: boolean) => toggleSave.mutate({ recipeId: item.recipe.id, next }),
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

  const discoverBanner = isDiscover && items.length > 0 && (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '10px 13px',
        marginBottom: 14,
        borderRadius: 14,
        background: 'var(--chipbg)',
        color: 'var(--chipcol)',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <span aria-hidden style={{ fontSize: 15, flexShrink: 0 }}>✦</span>
      <span>
        <strong style={{ fontWeight: 800 }}>Discover</strong> — you're not following anyone yet, so
        here's a taste of the whole kitchen.
      </span>
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
    <StateBlock
      title="Nothing cooking yet"
      body="No posts to show. Browse the library and follow some cooks — their new recipes will land here."
      action={{ label: 'Browse recipes', onClick: () => navigate('/library') }}
    />
  ) : null

  // ── Mobile: immersive full-bleed scroll-snap feed (design 1e) ──────────────
  if (!isDesktop) {
    if (stateBlock) {
      return (
        <div className="scroll" style={{ ...mobilePad, overflowY: 'auto' }}>
          <FeedHeading />
          {stateBlock}
        </div>
      )
    }
    return (
      <div style={{ position: 'absolute', inset: 0, bottom: 'var(--nav-h, 74px)', display: 'flex', flexDirection: 'column', background: '#000' }}>
        {discoverBanner && <div style={{ padding: '10px 14px 0' }}>{discoverBanner}</div>}
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
        <div style={{ display: 'flex', gap: 20, fontSize: 14.5, fontWeight: 700 }}>
          <span style={{ color: 'var(--text)', borderBottom: '2px solid var(--accent)', paddingBottom: 4 }}>
            {isDiscover ? 'Discovering' : 'Following'}
          </span>
        </div>
      </div>

      {stateBlock ? (
        stateBlock
      ) : (
        <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, maxWidth: 620, margin: '0 auto' }}>
            {discoverBanner}
            {items.map((item) => (
              <FeedPostCard key={item.recipe.id} item={item} {...cardProps(item)} />
            ))}
            {loadMore}
          </div>
          <DiscoveryRail items={items} onOpenAuthor={(id) => navigate(`/users/${id}`)} />
        </div>
      )}
    </div>
  )
}

// ── Mobile heading (only shown over the non-immersive state screens) ─────────

function FeedHeading() {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>Feed</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>Fresh recipes from the cooks you follow.</div>
    </div>
  )
}

// ── Desktop discovery rail — suggested cooks + trending tags, both derived ───

function DiscoveryRail({ items, onOpenAuthor }: { items: FeedItemResponse[]; onOpenAuthor: (id: string) => void }) {
  const cooks = useMemo(() => {
    const seen = new Map<string, UserSummaryResponse>()
    for (const item of items) {
      if (!seen.has(item.author.id)) seen.set(item.author.id, item.author)
    }
    return Array.from(seen.values()).slice(0, 5)
  }, [items])

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
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Suggested cooks</div>
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
