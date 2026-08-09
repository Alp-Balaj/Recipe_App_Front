// ─────────────────────────────────────────────────────────────────────────
// One row of a follow list. Shared by the desktop split and the phone list.
//
// Two sibling buttons inside a non-interactive <div> — never nested. Nesting
// interactive content inside a <button> (even an ARIA `role="button"`) is
// invalid per the HTML content model (axe-core's `nested-interactive` rule):
// it renders fine but breaks the accessibility tree, since the outer
// button's name-from-content would flatten every descendant into one
// string. Siblings give each control its own unambiguous accessible name,
// and no stopPropagation() is needed — there is no ancestor handler for a
// click to leak into.
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
    <div style={{ ...row, background: selected ? 'var(--accent-soft)' : 'transparent' }}>
      <button onClick={onSelect} aria-current={selected ? 'true' : undefined} style={selectBtn}>
        <Avatar username={user.username} profileImageUrl={user.profileImageUrl} seed={user.id} size={40} />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span style={name}>{user.username}</span>
          <span style={sub}>
            {user.recipeCount} {user.recipeCount === 1 ? 'recipe' : 'recipes'}
          </span>
        </span>
      </button>
      <button
        onClick={() => onToggleFollow(!user.followedByMe)}
        aria-pressed={user.followedByMe}
        style={user.followedByMe ? followingChip : followChip}
      >
        {user.followedByMe ? '✓ Following' : 'Follow'}
      </button>
    </div>
  )
}

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  borderRadius: 11,
  padding: '4px 8px',
}

const selectBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  flex: 1,
  minWidth: 0,
  background: 'transparent',
  border: 'none',
  borderRadius: 9,
  padding: '6px 2px',
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
  border: 'none',
  borderRadius: 10,
  padding: '6px 12px',
  fontFamily: 'inherit',
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
