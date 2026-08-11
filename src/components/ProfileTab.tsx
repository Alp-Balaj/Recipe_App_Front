// ─────────────────────────────────────────────────────────────────────────
// The own-profile tab — Recipe App Redesign (design 3b mobile / 4a desktop).
//
// Mobile: an Instagram-style centered hero (avatar + Lv badge, name, tier),
// the gamified rank card, Settings/Share actions, a stats strip, a badges
// grid, then Recipes / Saved / Activity tabs.
// Desktop: a sticky left summary column (avatar, rank, badges) beside a tabbed
// content pane — AppShell provides the outer sidebar chrome.
//
// Everything is grounded in real data: rank comes from the backend's
// cookingRank (titled + progress via cookingRankMeta), counts from
// GET /users/{me}, the Recipes/Saved tabs from real endpoints, badges derived
// from real counters, and Activity derived from the caller's publish history.
// The primary action opens Settings, whose Account section now includes a real
// Edit profile form (PUT /users/me — username, bio, photo, default visibility).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { UserProfileResponse } from '@/api/social'
import { useAuth } from '@/auth/AuthContext'
import Avatar from '@/components/Avatar'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useUserProfile } from '@/hooks/useUserProfile'
import type { FollowListKind } from '@/hooks/useFollowList'
import { cookingRankMeta, type CookingRankMeta } from '@/lib/cookingRank'
import { deriveBadges, earnedBadgeCount, type ProfileBadge } from '@/lib/profileBadges'
import { gradientFor } from '@/pages/recipeVisuals'
import type { Mode } from './ThemeRoot'
import ProfileActivityTab from './profile/ProfileActivityTab'
import ProfileCookedTab from './profile/ProfileCookedTab'
import ProfileRecipesTab from './profile/ProfileRecipesTab'
import ProfileSavedTab from './profile/ProfileSavedTab'
import SettingsView from './profile/SettingsView'

interface Props {
  mode: Mode
  onSetMode: (mode: Mode) => void
}

// KAN-4 (design D16) adds 'cooked' — the fourth tab. It sits between Saved and
// Activity because the first three are all collections the user keeps ABOUT
// themselves (what they wrote, what they bookmarked, what they made) and
// Activity is the odd one out: a derived stream rather than a collection.
type ContentTab = 'recipes' | 'saved' | 'cooked' | 'activity'

const TABS: { id: ContentTab; label: string }[] = [
  { id: 'recipes', label: '▦ Recipes' },
  { id: 'saved', label: '⚑ Saved' },
  { id: 'cooked', label: '◍ Cooked' },
  { id: 'activity', label: '⟳ Activity' },
]

export default function ProfileTab({ mode, onSetMode }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState<ContentTab>('recipes')
  const [shareToast, setShareToast] = useState<string | null>(null)

  const { data: profile } = useUserProfile(user?.userId)

  const username = user?.username ?? 'Signed in'
  const userId = user?.userId
  const rank = cookingRankMeta(profile?.cookingRank ?? 0)
  const badges = useMemo(
    () =>
      deriveBadges({
        recipeCount: profile?.recipeCount ?? 0,
        followerCount: profile?.followerCount ?? 0,
        followingCount: profile?.followingCount ?? 0,
        cookingRank: profile?.cookingRank ?? 0,
      }),
    [profile],
  )
  const earned = earnedBadgeCount(badges)

  // Transient share toast auto-clears.
  useEffect(() => {
    if (!shareToast) return
    const t = setTimeout(() => setShareToast(null), 2600)
    return () => clearTimeout(t)
  }, [shareToast])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const handleShareProfile = async () => {
    if (!userId) return
    const url = `${window.location.origin}/users/${userId}`
    try {
      await navigator.clipboard?.writeText(url)
      setShareToast('Profile link copied to clipboard.')
    } catch {
      setShareToast('Could not copy the link.')
    }
  }

  const renderTabContent = (columns: number): ReactNode => {
    switch (tab) {
      case 'recipes':
        return <ProfileRecipesTab columns={columns} />
      case 'saved':
        return <ProfileSavedTab />
      case 'cooked':
        return <ProfileCookedTab />
      case 'activity':
        return <ProfileActivityTab />
    }
  }

  if (showSettings) {
    return (
      <SettingsView
        mode={mode}
        onSetMode={onSetMode}
        onLogout={handleLogout}
        onBack={() => setShowSettings(false)}
        profile={profile}
      />
    )
  }

  const shared: LayoutProps = {
    profile,
    username,
    userId,
    rank,
    badges,
    earned,
    tab,
    onTab: setTab,
    onOpenSettings: () => setShowSettings(true),
    onShareProfile: handleShareProfile,
    onOpenFollow: (kind: FollowListKind) => userId && navigate(`/users/${userId}/${kind}`),
    onNewRecipe: () => navigate('/recipes/new'),
    shareToast,
    renderTabContent,
  }

  return isDesktop ? <DesktopProfile {...shared} /> : <MobileProfile {...shared} />
}

// ── Shared layout props ──────────────────────────────────────────────────────

interface LayoutProps {
  profile?: UserProfileResponse
  username: string
  userId: string | undefined
  rank: CookingRankMeta
  badges: ProfileBadge[]
  earned: number
  tab: ContentTab
  onTab: (t: ContentTab) => void
  onOpenSettings: () => void
  onShareProfile: () => void
  onOpenFollow: (kind: FollowListKind) => void
  onNewRecipe: () => void
  shareToast: string | null
  renderTabContent: (columns: number) => ReactNode
}

// ── Mobile ───────────────────────────────────────────────────────────────────

function MobileProfile(p: LayoutProps) {
  return (
    <div className="scroll" style={mobilePage}>
      {p.shareToast && <ShareToast text={p.shareToast} />}

      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 14 }}>Profile</div>

      {/* Centered hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <AvatarWithLevel username={p.username} userId={p.userId} profile={p.profile} rank={p.rank.value} size={92} />
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', marginTop: 12 }}>{p.username}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{p.rank.title}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <RankCard rank={p.rank} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 9, marginTop: 14 }}>
        <ActionButton primary onClick={p.onOpenSettings}>
          ⚙ Settings
        </ActionButton>
        <ActionButton onClick={p.onShareProfile}>↗ Share</ActionButton>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', marginTop: 16, ...statStrip }}>
        <StatCell value={p.profile?.recipeCount} label="Recipes" onClick={() => p.onTab('recipes')} divider />
        <StatCell value={p.profile?.followerCount} label="Followers" onClick={() => p.onOpenFollow('followers')} divider />
        <StatCell value={p.profile?.followingCount} label="Following" onClick={() => p.onOpenFollow('following')} />
      </div>

      {/* Badges */}
      <div style={{ marginTop: 16 }}>
        <BadgesCard badges={p.badges} earned={p.earned} />
      </div>

      {/* Tabs + content */}
      <div style={{ marginTop: 20 }}>
        <TabBar tab={p.tab} onTab={p.onTab} recipeCount={p.profile?.recipeCount} centered />
        <div style={{ marginTop: 16 }}>{p.renderTabContent(1)}</div>
      </div>
    </div>
  )
}

// ── Desktop ──────────────────────────────────────────────────────────────────

function DesktopProfile(p: LayoutProps) {
  return (
    <div className="scroll" style={desktopPage}>
      {/* Full-bleed cover, keyed off the user so it's stable per profile. */}
      <div style={{ height: 150, background: gradientFor(p.userId ?? p.username) }} />

      <div style={{ padding: '0 40px 44px', maxWidth: 1080 }}>
        {/* Hero — the avatar overlaps the cover; identity left, actions right. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22, marginTop: -46 }}>
          <AvatarWithLevel
            username={p.username}
            userId={p.userId}
            profile={p.profile}
            rank={p.rank.value}
            size={104}
            onCover
          />
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 18,
              flexWrap: 'wrap',
              paddingBottom: 6,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>{p.username}</div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 2 }}>{p.rank.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <HeaderButton primary onClick={p.onOpenSettings}>
                ⚙ Settings
              </HeaderButton>
              <HeaderButton onClick={p.onShareProfile}>↗ Share</HeaderButton>
            </div>
          </div>
        </div>

        {p.profile?.bio && (
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 14, maxWidth: 620 }}>
            {p.profile.bio}
          </div>
        )}

        {p.shareToast && (
          <div style={{ marginTop: 16 }}>
            <ShareToast text={p.shareToast} />
          </div>
        )}

        {/* Design 4b: a 340px stats/rank/badges rail beside the tabbed grid. */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 22, marginTop: 26, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', ...statStrip, borderRadius: 18, padding: '16px 0' }}>
              <StatCell value={p.profile?.recipeCount} label="Recipes" onClick={() => p.onTab('recipes')} divider desktop />
              <StatCell value={p.profile?.followerCount} label="Followers" onClick={() => p.onOpenFollow('followers')} divider desktop />
              <StatCell value={p.profile?.followingCount} label="Following" onClick={() => p.onOpenFollow('following')} desktop />
            </div>

            <RankCard rank={p.rank} desktop />
            <BadgesCard badges={p.badges} earned={p.earned} desktop />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={contentHeader}>
              <TabBar tab={p.tab} onTab={p.onTab} recipeCount={p.profile?.recipeCount} desktop />
              <button onClick={p.onNewRecipe} style={newRecipeBtn}>
                ＋ New recipe
              </button>
            </div>
            <div style={{ marginTop: 20 }}>{p.renderTabContent(2)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function AvatarWithLevel({
  username,
  userId,
  profile,
  rank,
  size,
  onCover,
}: {
  username: string
  userId: string | undefined
  profile?: UserProfileResponse
  rank: number
  size: number
  /** Desktop hero: the avatar overlaps the cover, so it gets a plain page-
   *  coloured cut-out ring instead of the olive halo used on the mobile hero. */
  onCover?: boolean
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', flexShrink: 0 }}>
      <div
        style={{
          borderRadius: '50%',
          boxShadow: onCover ? '0 0 0 5px var(--bg)' : '0 0 0 2px var(--bg), 0 0 0 4px var(--accent-fill)',
        }}
      >
        <Avatar username={username} profileImageUrl={profile?.profileImageUrl} seed={userId ?? username} size={size} />
      </div>
      <div style={{ ...levelBadge, ...(onCover ? { bottom: 2, right: -2 } : null) }}>Lv {rank}</div>
    </div>
  )
}

function RankCard({ rank, desktop }: { rank: CookingRankMeta; desktop?: boolean }) {
  // Desktop folds "x to next" into the subtitle line; mobile keeps the two
  // labels under the bar (design 4b vs 3b).
  const toNext = rank.pointsToNext != null && rank.nextTitle ? `${rank.pointsToNext} to ${rank.nextTitle}` : null

  return (
    <div style={desktop ? { ...rankCard, borderRadius: 18, padding: '17px 18px' } : rankCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={desktop ? { ...rankGlyph, width: 42, height: 42, fontSize: 20 } : rankGlyph}>✦</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{rank.title}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {rank.value} pts{desktop && toNext ? ` · ${toNext}` : ''}
          </div>
        </div>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'var(--surface2)',
          marginTop: desktop ? 15 : 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${rank.progress}%`, height: '100%', background: 'var(--accent-grad)' }} />
      </div>
      {!desktop && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, fontSize: 10.5, color: 'var(--muted)' }}>
          <span>{rank.pointsToNext != null ? `${rank.pointsToNext} pts to next` : 'Top tier'}</span>
          <span>{rank.nextTitle ? `Next: ${rank.nextTitle}` : 'Top tier'}</span>
        </div>
      )}
    </div>
  )
}

function BadgesCard({ badges, earned, desktop }: { badges: ProfileBadge[]; earned: number; desktop?: boolean }) {
  const tile = desktop ? 50 : 48

  return (
    <div style={desktop ? { ...badgesCard, borderRadius: 18, padding: '17px 18px' } : badgesCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: desktop ? 15 : 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Badges</div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent)' }}>
          {`${earned} of ${badges.length}`}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: desktop ? 14 : 12 }}>
        {badges.map((b) => (
          <div
            key={b.id}
            title={b.desc}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: b.earned ? 1 : 0.4 }}
          >
            <div
              style={{
                width: tile,
                height: tile,
                borderRadius: 15,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: desktop ? 21 : 20,
                background: b.earned ? 'var(--accent-soft)' : 'var(--surface2)',
              }}
            >
              {b.icon}
            </div>
            <div style={{ fontSize: desktop ? 10 : 9.5, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.2 }}>
              {b.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCell({
  value,
  label,
  onClick,
  divider,
  desktop,
}: {
  value: number | undefined
  label: string
  onClick: () => void
  divider?: boolean
  desktop?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${value ?? '—'} ${label}`}
      style={{
        flex: 1,
        textAlign: 'center',
        background: 'transparent',
        border: 'none',
        borderRight: divider ? '1px solid var(--border)' : 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        padding: '2px 6px',
      }}
    >
      <div style={{ fontSize: desktop ? 20 : 17, fontWeight: 800, color: 'var(--text)' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{label}</div>
    </button>
  )
}

function TabBar({
  tab,
  onTab,
  recipeCount,
  centered,
  desktop,
}: {
  tab: ContentTab
  onTab: (t: ContentTab) => void
  recipeCount?: number
  centered?: boolean
  desktop?: boolean
}) {
  const size = desktop ? 14 : 13.5

  return (
    <div
      style={{
        display: 'flex',
        gap: desktop ? 26 : centered ? 24 : 28,
        justifyContent: centered ? 'center' : 'flex-start',
        borderBottom: '1px solid var(--border)',
        fontSize: size,
        fontWeight: 700,
        flex: desktop ? 1 : undefined,
      }}
    >
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            aria-pressed={active}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: size,
              fontWeight: 700,
              padding: desktop ? '2px 0 12px' : '2px 0 11px',
              marginBottom: -1,
              color: active ? 'var(--text)' : 'var(--navidle)',
              borderBottom: active ? '2px solid var(--accent-fill)' : '2px solid transparent',
            }}
          >
            {t.label}
            {t.id === 'recipes' && recipeCount != null && (
              <span style={{ color: 'var(--muted)', fontWeight: 600 }}> {recipeCount}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function ActionButton({
  children,
  onClick,
  primary,
}: {
  children: ReactNode
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: 'center',
        cursor: 'pointer',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: 13,
        padding: 11,
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: primary ? 800 : 700,
        background: primary ? 'var(--accent-fill)' : 'var(--surface2)',
        color: primary ? 'var(--accent-ink)' : 'var(--text)',
      }}
    >
      {children}
    </button>
  )
}

/** Desktop hero action — the same pair as mobile, sized to sit beside the name
 *  rather than stretch across the column (design 4b). */
function HeaderButton({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: primary ? 'none' : '1px solid var(--border)',
        borderRadius: 12,
        padding: '11px 20px',
        fontFamily: 'inherit',
        fontSize: 13.5,
        fontWeight: primary ? 800 : 700,
        background: primary ? 'var(--accent-fill)' : 'var(--surface)',
        color: primary ? 'var(--accent-ink)' : 'var(--text)',
      }}
    >
      {children}
    </button>
  )
}

function ShareToast({ text }: { text: string }) {
  return (
    <div
      role="status"
      style={{
        fontSize: 13,
        color: 'var(--accent)',
        background: 'var(--accent-soft)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '10px 12px',
        marginBottom: 14,
      }}
    >
      {text}
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

// overflowX is NOT decoration here. `position: absolute` + `overflowY: auto`
// makes overflow-x compute to `auto` (CSS forbids one axis scrolling while the
// other stays visible), and `.scroll` zeroes the scrollbar — so anything wider
// than the column turns the page into a silent sideways slide with nothing on
// screen to explain it. Horizontal scroll is never wanted on this page, so the
// capability is removed rather than the symptom chased.
const mobilePage: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '54px 18px 16px',
}

// Padding lives on the inner wrapper so the cover banner bleeds edge to edge.
// Same overflowX reasoning as mobilePage — the hazard is the container's, not
// the breakpoint's, so leaving desktop out would just hide the next instance.
const desktopPage: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
}

const contentHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  gap: 16,
}

const newRecipeBtn: CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 11,
  padding: '9px 15px',
  marginBottom: 8,
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 800,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
}

const statStrip: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 16,
  padding: '12px 0',
}

const levelBadge: CSSProperties = {
  position: 'absolute',
  bottom: -4,
  right: -4,
  background: 'var(--accent-grad)',
  color: '#2a2410',
  fontSize: 11,
  fontWeight: 800,
  borderRadius: 999,
  padding: '3px 9px',
  border: '2px solid var(--bg)',
}

const rankCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: '16px 17px',
}

const rankGlyph: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  background: 'var(--accent-grad)',
  color: '#2a2410',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 19,
  fontWeight: 800,
  flexShrink: 0,
}

const badgesCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: '16px 17px',
}
