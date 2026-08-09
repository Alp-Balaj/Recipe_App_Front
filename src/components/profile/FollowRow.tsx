// ─────────────────────────────────────────────────────────────────────────
// One row of a follow list. Shared by the desktop split and the phone list.
//
// The Follow button stops propagation: without it, following someone also
// fires the row's select/navigate and yanks the user out of the list they
// were working through.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import Avatar from '@/components/Avatar'
import type { FollowListItemResponse } from '@/api/social'

interface Props {
  user: FollowListItemResponse
  selected?: boolean
  onSelect: () => void
  onToggleFollow: (next: boolean) => void
}

export default function FollowRow({ user, selected = false, onSelect, onToggleFollow }: Props) {
  return (
    <button
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      style={{ ...row, background: selected ? 'var(--accent-soft)' : 'transparent' }}
    >
      <Avatar username={user.username} profileImageUrl={user.profileImageUrl} seed={user.id} size={40} />
      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <span style={name}>{user.username}</span>
        <span style={sub}>
          {user.recipeCount} {user.recipeCount === 1 ? 'recipe' : 'recipes'}
        </span>
      </span>
      <span
        role="button"
        tabIndex={0}
        aria-pressed={user.followedByMe}
        onClick={(e) => {
          e.stopPropagation()
          onToggleFollow(!user.followedByMe)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          e.stopPropagation()
          onToggleFollow(!user.followedByMe)
        }}
        style={user.followedByMe ? followingChip : followChip}
      >
        {user.followedByMe ? '✓ Following' : 'Follow'}
      </span>
    </button>
  )
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  width: '100%',
  border: 'none',
  borderRadius: 11,
  padding: '8px 8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const name: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const sub: CSSProperties = { display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }

const followChip: CSSProperties = {
  flexShrink: 0,
  fontSize: 12,
  fontWeight: 700,
  borderRadius: 10,
  padding: '6px 12px',
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
  cursor: 'pointer',
}

const followingChip: CSSProperties = {
  ...followChip,
  background: 'var(--surface)',
  color: 'var(--muted)',
  border: '1px solid var(--border)',
}
