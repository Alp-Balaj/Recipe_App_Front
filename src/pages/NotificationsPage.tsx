// ─────────────────────────────────────────────────────────────────────────
// /notifications (open-loops slice 3) — the social loop's return path.
//
// Visiting marks the page read, once, against the newest row's timestamp
// rather than "now": a notification that lands while you are reading is not
// something you have seen, and a `now` bound would swallow it.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '@/components/Avatar'
import StateBlock from '@/components/ui/StateBlock'
import { useMarkNotificationsRead, useNotifications } from '@/hooks/useNotifications'
import { timeAgo } from '@/lib/time'
import type { NotificationResponse } from '@/api/notifications'

export default function NotificationsPage() {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotifications()
  const markRead = useMarkNotificationsRead()

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: NotificationResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const n of page.items) {
        if (!seen.has(n.id)) {
          seen.add(n.id)
          out.push(n)
        }
      }
    }
    return out
  }, [data])

  // Mark read once per mount. The ref guard matters because the mutation
  // invalidates the list, which re-renders this effect's dependencies — without
  // it, marking read would loop.
  const markedRef = useRef(false)
  const newest = items[0]?.createdAt
  useEffect(() => {
    if (markedRef.current || !newest) return
    const anyUnread = items.some((n) => !n.readAt)
    if (!anyUnread) return
    markedRef.current = true
    markRead.mutate(newest)
  }, [newest, items, markRead])

  return (
    <div className="scroll" style={pageStyle}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Notifications</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3, marginBottom: 18 }}>
        What happened while you were cooking
      </div>

      {isLoading ? (
        <StateBlock title="Loading…" body="Fetching what you missed." />
      ) : isError ? (
        <StateBlock
          title="Couldn't load notifications"
          body="Something went wrong reaching the kitchen."
          action={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : items.length === 0 ? (
        <StateBlock
          title="Nothing yet"
          body="Likes, comments and follows on your recipes will show up here."
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((n) => (
              <NotificationRow key={n.id} notification={n} />
            ))}
          </div>

          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0' }}>
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** The sentence, the link target, and whether it still has somewhere to go. */
function describe(n: NotificationResponse): { text: string; to: string | null } {
  const who = n.actor.username
  const what = n.recipeTitle ?? 'a recipe'
  switch (n.type) {
    case 'RecipeLiked':
      return { text: `${who} liked ${what}`, to: n.recipeId ? `/recipes/${n.recipeId}` : null }
    case 'RecipeCommented':
      return { text: `${who} commented on ${what}`, to: n.recipeId ? `/recipes/${n.recipeId}` : null }
    case 'CommentLiked':
      return { text: `${who} liked your comment`, to: n.recipeId ? `/recipes/${n.recipeId}` : null }
    case 'UserFollowed':
      return { text: `${who} followed you`, to: `/users/${n.actor.id}` }
  }
}

function NotificationRow({ notification }: { notification: NotificationResponse }) {
  const { text, to } = describe(notification)
  const unread = !notification.readAt

  const body = (
    <>
      <Avatar username={notification.actor.username} seed={notification.actor.id} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{text}</div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
          {timeAgo(notification.createdAt)}
        </div>
      </div>
      {/* Unread is carried by the dot AND by the row's tint, so it does not
          depend on colour alone. */}
      {unread && <span aria-hidden style={unreadDot} />}
    </>
  )

  const rowStyle: CSSProperties = {
    ...row,
    background: unread ? 'var(--chipbg)' : 'transparent',
  }

  // A notification whose subject was deleted keeps its line but loses its link —
  // better than a tap that lands on a 404.
  return to ? (
    <Link to={to} style={{ ...rowStyle, textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    <div style={rowStyle}>{body}</div>
  )
}

const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '54px 18px 24px',
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: '11px 12px',
  borderRadius: 12,
  borderBottom: '1px solid var(--border)',
}

const unreadDot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: 'var(--accent)',
  flexShrink: 0,
}

const loadMoreBtn: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  padding: '9px 18px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--fg)',
  cursor: 'pointer',
}
