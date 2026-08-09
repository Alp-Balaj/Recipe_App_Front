// ─────────────────────────────────────────────────────────────────────────
// /users/:id/followers and /users/:id/following — the follow list as a real
// page (desktop follow list plan). Replaces FollowListModal, which was a
// 380px phone card marooned on a desktop screen.
//
// Desktop splits list + preview pane; below 1024px the pane is dropped and a
// row navigates to the profile, which is the old behaviour. Selection rides
// ?u= with replace:true so reload keeps the preview but Back leaves the page
// instead of unwinding every row the reader clicked.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import FollowRow from '@/components/profile/FollowRow'
import FollowPreviewPane from '@/components/profile/FollowPreviewPane'
import StateBlock from '@/components/ui/StateBlock'
import { useAuthGate } from '@/auth/AuthGateContext'
import { useFollowList, type FollowListKind } from '@/hooks/useFollowList'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import { useUserProfile } from '@/hooks/useUserProfile'
import type { FollowListItemResponse } from '@/api/social'

const TITLE: Record<FollowListKind, string> = { followers: 'Followers', following: 'Following' }

export default function FollowListPage() {
  const { id } = useParams<{ id: string }>()
  const { pathname } = useLocation()
  // Derived, not a prop: page() takes no props, and both routes share this component.
  const kind: FollowListKind = pathname.endsWith('/following') ? 'following' : 'followers'
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { requireAuth } = useAuthGate()
  const { toggleFollow } = useSocialMutations()

  const [term, setTerm] = useState('')
  const [q, setQ] = useState('')

  // Both routes share ONE lazy() identity (so Rollup keeps this a single
  // chunk) and react-router renders `match.route.element` with no `key`, so
  // switching tabs reconciles this component IN PLACE rather than
  // remounting it — `term`/`q` are plain state and would otherwise survive
  // the switch, leaving the Following list filtered by whatever the reader
  // typed on Followers. Reset both when `kind` changes instead of relying on
  // a remount.
  //
  // A mid-flight debounce timer cannot land after this and re-apply the old
  // term: setTerm('') here changes `term`, and React re-runs effects by
  // comparing each effect's OWN dependency array across renders — so the
  // debounce effect below (keyed on [term]) always tears down its previous
  // setTimeout (scheduled for the old term) before scheduling a new one for
  // the reset value, regardless of the order these two effects are declared
  // in.
  useEffect(() => {
    setTerm('')
    setQ('')
  }, [kind])

  useEffect(() => {
    const t = setTimeout(() => setQ(term.trim()), 300)
    return () => clearTimeout(t)
  }, [term])

  const { data: owner } = useUserProfile(id)
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFollowList(id, kind, true, q)

  const users = useMemo(() => {
    const seen = new Set<string>()
    const out: FollowListItemResponse[] = []
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

  const selected = isDesktop ? params.get('u') : null

  const onSelect = (userId: string) => {
    if (isDesktop) setParams({ u: userId }, { replace: true })
    else navigate(`/users/${userId}`)
  }

  const onToggleFollow = (userId: string, next: boolean) => {
    if (!requireAuth()) return
    toggleFollow.mutate({ userId, next })
  }

  const list = (
    <>
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder={kind === 'followers' ? 'Search followers' : 'Search following'}
        aria-label={kind === 'followers' ? 'Search followers' : 'Search following'}
        style={search}
      />

      {isLoading ? (
        <StateBlock title="Loading…" />
      ) : isError ? (
        <StateBlock
          title="Couldn't load the list"
          action={{ label: 'Try again', onClick: () => refetch() }}
        />
      ) : users.length === 0 && q ? (
        <StateBlock
          title={`No one matching “${q}”`}
          body="Try a different name."
          action={{ label: 'Clear search', onClick: () => setTerm('') }}
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
            <FollowRow
              key={u.id}
              user={u}
              selected={u.id === selected}
              onSelect={() => onSelect(u.id)}
              onToggleFollow={(next) => onToggleFollow(u.id, next)}
            />
          ))}
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                style={{ ...loadMore, opacity: isFetchingNextPage ? 0.6 : 1 }}
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  )

  return (
    <div className="scroll" style={page}>
      <button onClick={() => navigate(`/users/${id}`)} aria-label="Back" style={back}>
        ← {owner?.username ?? 'Profile'}
      </button>

      <h1 style={heading}>{TITLE[kind]}</h1>

      {/* Routes, so real links — and the selection does not survive the switch. */}
      <div style={tabs}>
        <Link to={`/users/${id}/followers`} aria-current={kind === 'followers' ? 'page' : undefined} style={tab(kind === 'followers')}>
          Followers
        </Link>
        <Link to={`/users/${id}/following`} aria-current={kind === 'following' ? 'page' : undefined} style={tab(kind === 'following')}>
          Following
        </Link>
      </div>

      {isDesktop ? (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ width: 340, flexShrink: 0 }}>{list}</div>
          <div style={{ flex: 1, minWidth: 0, position: 'sticky', top: 0 }}>
            <FollowPreviewPane userId={selected} />
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 640 }}>{list}</div>
      )}
    </div>
  )
}

const page: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '28px 24px 24px',
}

const back: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  fontFamily: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  marginBottom: 6,
}

const heading: CSSProperties = { fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }

const tabs: CSSProperties = {
  display: 'flex',
  gap: 4,
  background: 'var(--surface2)',
  borderRadius: 13,
  padding: 4,
  width: 'max-content',
  margin: '14px 0 16px',
}

const tab = (on: boolean): CSSProperties => ({
  fontSize: 13,
  fontWeight: on ? 800 : 600,
  padding: '7px 18px',
  borderRadius: 10,
  textDecoration: 'none',
  color: on ? 'var(--text)' : 'var(--muted)',
  background: on ? 'var(--surface)' : 'transparent',
})

const search: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--inputbg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '9px 12px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  color: 'var(--text)',
  marginBottom: 10,
}

const loadMore: CSSProperties = {
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
