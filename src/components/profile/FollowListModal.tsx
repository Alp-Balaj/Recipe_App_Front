// ─────────────────────────────────────────────────────────────────────────
// Followers / Following overlay (design 3g). Opened from the profile stat
// tiles; lists the compact user rows from GET /users/{id}/followers|/following
// and links each into its public profile. The router is frozen (no dedicated
// route), so this is a Modal rather than a page. Items are UserSummaryResponse
// (no per-row followedByMe), so there's no follow button here — a tap opens
// the profile, where the real follow control lives.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties } from 'react'
import type { UserSummaryResponse } from '@/api/social'
import Avatar from '@/components/Avatar'
import Modal from '@/components/ui/Modal'
import StateBlock from '@/components/ui/StateBlock'
import { useFollowList, type FollowListKind } from '@/hooks/useFollowList'

interface Props {
  userId: string
  kind: FollowListKind
  onClose: () => void
  onOpenUser: (userId: string) => void
}

const TITLE: Record<FollowListKind, string> = {
  followers: 'Followers',
  following: 'Following',
}

export default function FollowListModal({ userId, kind, onClose, onOpenUser }: Props) {
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFollowList(userId, kind)

  const users = useMemo(() => {
    const seen = new Set<string>()
    const out: UserSummaryResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const u of page.items) {
        if (!seen.has(u.id)) {
          seen.add(u.id)
          out.push(u)
        }
      }
    }
    return out
  }, [data])

  return (
    <Modal variant="center" label={TITLE[kind]} onClose={onClose}>
      <div style={panel}>
        <div style={header}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{TITLE[kind]}</div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>
            ✕
          </button>
        </div>

        <div className="scroll" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {isLoading ? (
            <StateBlock title="Loading…" />
          ) : isError ? (
            <StateBlock
              title="Couldn't load the list"
              action={{ label: 'Try again', onClick: () => refetch() }}
            />
          ) : users.length === 0 ? (
            <StateBlock
              title={kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              body={
                kind === 'followers'
                  ? 'Recipes you share will help cooks find you.'
                  : 'Follow cooks to see their recipes in your feed.'
              }
            />
          ) : (
            <>
              {users.map((u) => (
                <button key={u.id} onClick={() => onOpenUser(u.id)} style={row}>
                  <Avatar username={u.username} profileImageUrl={u.profileImageUrl} seed={u.id} size={44} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={rowName}>{u.username}</span>
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 15 }}>›</span>
                </button>
              ))}
              {hasNextPage && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
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
      </div>
    </Modal>
  )
}

const panel: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: '16px 16px 12px',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
}

const closeBtn: CSSProperties = {
  border: 'none',
  background: 'var(--surface2)',
  color: 'var(--muted)',
  width: 30,
  height: 30,
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'inherit',
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  background: 'transparent',
  border: 'none',
  padding: '9px 4px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const rowName: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const loadMoreBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '9px 16px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}
