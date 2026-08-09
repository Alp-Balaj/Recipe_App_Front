// ─────────────────────────────────────────────────────────────────────────
// The profile identity block — avatar, name, rank, bio, counts, follow.
//
// Extracted from UserProfilePage (desktop follow list plan) so the follow
// list's preview pane and the profile page render the SAME block. The two
// sizes are a prop rather than caller styling, deliberately: a caller that
// styles around this component is how the two copies drift apart again.
// ─────────────────────────────────────────────────────────────────────────

import { Link, useNavigate } from 'react-router-dom'
import type { CSSProperties } from 'react'
import Avatar from '@/components/Avatar'
import { useAuth } from '@/auth/AuthContext'
import { useAuthGate } from '@/auth/AuthGateContext'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import { cookingRankMeta } from '@/lib/cookingRank'
import type { UserProfileResponse } from '@/api/social'

type SummarySize = 'page' | 'pane'

interface Props {
  profile: UserProfileResponse
  size?: SummarySize
}

const SIZES: Record<SummarySize, { avatar: number; name: number; gap: number }> = {
  page: { avatar: 76, name: 22, gap: 16 },
  pane: { avatar: 52, name: 15, gap: 12 },
}

export default function ProfileSummary({ profile, size = 'page' }: Props) {
  const { user } = useAuth()
  const { requireAuth } = useAuthGate()
  const navigate = useNavigate()
  const { toggleFollow } = useSocialMutations()
  const s = SIZES[size]
  const isOwn = user?.userId === profile.id

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: s.gap, marginBottom: 14 }}>
        <Avatar
          username={profile.username}
          profileImageUrl={profile.profileImageUrl}
          seed={profile.id}
          size={s.avatar}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: s.name,
              fontWeight: 800,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {profile.username}
          </div>
          <div style={{ marginTop: 5 }}>
            <span style={rankChip}>
              ✦ {profile.cookingRank} pts · {cookingRankMeta(profile.cookingRank).title}
            </span>
          </div>
        </div>
      </div>

      {profile.bio && (
        <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
          {profile.bio}
        </div>
      )}

      <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
        <StatLink
          to={`/users/${profile.id}/followers`}
          value={profile.followerCount}
          label={profile.followerCount === 1 ? 'Follower' : 'Followers'}
        />
        <StatLink
          to={`/users/${profile.id}/following`}
          value={profile.followingCount}
          label="Following"
        />
        <StatBlock
          value={profile.recipeCount}
          label={profile.recipeCount === 1 ? 'Recipe' : 'Recipes'}
        />
      </div>

      {isOwn ? (
        <button onClick={() => navigate('/profile')} style={ownProfileBtn}>
          This is you — open your profile
        </button>
      ) : (
        <button
          onClick={() => {
            // Guest access (§4.4): gate before .mutate — no optimistic patch for guests.
            if (!requireAuth()) return
            toggleFollow.mutate({ userId: profile.id, next: !profile.followedByMe })
          }}
          aria-pressed={profile.followedByMe}
          style={profile.followedByMe ? followingBtn : followBtn}
        >
          {profile.followedByMe ? '✓ Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <div style={statBox}>
      <div style={statValue}>{value}</div>
      <div style={statLabel}>{label}</div>
    </div>
  )
}

function StatLink({ to, value, label }: { to: string; value: number; label: string }) {
  return (
    <Link to={to} style={{ ...statBox, textDecoration: 'none', color: 'inherit' }}>
      <div style={statValue}>{value}</div>
      <div style={statLabel}>{label}</div>
    </Link>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────
// Copied verbatim from UserProfilePage — the page's existing values win over
// anything else, since this is an extraction, not a restyle.

const statBox: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '9px 6px',
}

const statValue: CSSProperties = { fontSize: 17, fontWeight: 800 }
const statLabel: CSSProperties = { fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }

const rankChip: CSSProperties = {
  display: 'inline-block',
  fontSize: 11.5,
  fontWeight: 700,
  padding: '3px 10px',
  borderRadius: 999,
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
}

const followBtn: CSSProperties = {
  width: '100%',
  cursor: 'pointer',
  border: 'none',
  borderRadius: 13,
  padding: '11px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

const followingBtn: CSSProperties = {
  ...followBtn,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
}

const ownProfileBtn: CSSProperties = {
  ...followBtn,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
}
