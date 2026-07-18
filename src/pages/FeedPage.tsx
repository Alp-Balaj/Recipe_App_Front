// ─────────────────────────────────────────────────────────────────────────
// /feed — the social feed (social-feed cp05).
//
// Keyset-paged GET /feed via useFeed (useInfiniteQuery); full-width post
// cards (FeedPostCard); optimistic like/save through the shared
// useSocialMutations hook — counts update in the cached envelope without a
// refetch. The cold-start "discover" source is visually labeled; empty/
// error/loading states use the shared StateBlock. Author links navigate to
// /users/:id (a stub until cp06 adds the profile route — the catch-all
// currently lands them on /library).
// ─────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FeedPostCard from '@/components/FeedPostCard'
import StateBlock from '@/components/ui/StateBlock'
import { useFeed } from '@/hooks/useFeed'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import type { FeedItemResponse } from '@/api/social'

const PAGE_STYLE = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 16px',
} as const

export default function FeedPage() {
  const navigate = useNavigate()
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

  return (
    <div className="scroll" style={PAGE_STYLE}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Feed</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
          {isDiscover
            ? 'What the community is cooking.'
            : 'Fresh recipes from the cooks you follow.'}
        </div>
      </div>

      {/* Cold-start label — the backend fell back to source:"discover". */}
      {isDiscover && items.length > 0 && (
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
            <strong style={{ fontWeight: 800 }}>Discover</strong> — you're not following anyone
            yet, so here's a taste of the whole kitchen.
          </span>
        </div>
      )}

      {/* Body states */}
      {isLoading ? (
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
      ) : (
        <>
          {items.map((item) => (
            <FeedPostCard
              key={item.recipe.id}
              item={item}
              onOpen={() => navigate(`/recipes/${item.recipe.id}`)}
              onOpenAuthor={() => navigate(`/users/${item.author.id}`)}
              onToggleLike={(next) => toggleLike.mutate({ recipeId: item.recipe.id, next })}
              onToggleSave={(next) => toggleSave.mutate({ recipeId: item.recipe.id, next })}
            />
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 12px' }}>
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
        </>
      )}
    </div>
  )
}

const loadMoreBtn = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
} as const
