// ─────────────────────────────────────────────────────────────────────────
// The own-profile tab. social-feed cp06 upgrades: real counts + cookingRank
// via GET /users/{id} (the same public-profile endpoint, called with our own
// id) and a Saved tab over GET /users/me/saved-recipes. The Settings tab
// (Appearance + Account) is the default and keeps the checkpoint-02 content
// unchanged; saved cards go through the shared social layer (seeded
// savedByMe — they came from the saved list) so unsave drops them in place.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { RecipeResponse } from '@/api/types'
import { useAuth } from '@/auth/AuthContext'
import SocialRecipeCard from '@/components/SocialRecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import { useSavedRecipes } from '@/hooks/useSavedRecipes'
import { useUserProfile } from '@/hooks/useUserProfile'
import type { Mode } from './ThemeRoot'

interface Props {
  mode: Mode
  onSetMode: (mode: Mode) => void
}

type ProfileSection = 'settings' | 'saved'

export default function ProfileTab({ mode, onSetMode }: Props) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [section, setSection] = useState<ProfileSection>('settings')

  // cp06: real counts — GET /users/{id} with our own id.
  const { data: profile } = useUserProfile(user?.userId)

  const username = user?.username ?? 'Signed in'
  const initial = username.charAt(0).toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div
      className="scroll"
      style={{
        position: 'absolute',
        inset: 0,
        bottom: 'var(--nav-h, 74px)',
        overflowY: 'auto',
        padding: '54px 18px 16px',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 18 }}>Profile</div>

      {/* User card — real logged-in identity + real counts (cp06) */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #5fb87e, #2f7349)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 22,
            fontWeight: 800,
          }}>
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {username}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              {profile ? `✦ Rank ${profile.cookingRank}` : 'Signed in'}
            </div>
          </div>
        </div>

        {/* Counts strip — hidden until GET /users/{id} answers. */}
        {profile && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Stat value={profile.followerCount} label={profile.followerCount === 1 ? 'Follower' : 'Followers'} />
            <Stat value={profile.followingCount} label="Following" />
            <Stat value={profile.recipeCount} label={profile.recipeCount === 1 ? 'Recipe' : 'Recipes'} />
          </div>
        )}
      </div>

      {/* Section switch — Settings (checkpoint-02 content) | Saved (cp06) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['settings', 'saved'] as ProfileSection[]).map((s) => {
          const active = section === s
          return (
            <button
              key={s}
              onClick={() => setSection(s)}
              aria-pressed={active}
              style={{
                ...sectionChip,
                background: active ? 'var(--accent)' : 'var(--surface2)',
                color: active ? 'var(--accent-ink)' : 'var(--muted)',
              }}
            >
              {s === 'settings' ? '⚙ Settings' : '⚑ Saved'}
            </button>
          )
        })}
      </div>

      {section === 'settings' ? (
        <SettingsSection mode={mode} onSetMode={onSetMode} onLogout={handleLogout} />
      ) : (
        <SavedSection onOpen={(r) => navigate(`/recipes/${r.id}`)} onBrowse={() => navigate('/library')} />
      )}
    </div>
  )
}

// ── Settings (the checkpoint-02 content, unchanged) ─────────────────────────

function SettingsSection({ mode, onSetMode, onLogout }: { mode: Mode; onSetMode: (m: Mode) => void; onLogout: () => void }) {
  return (
    <>
      {/* Appearance section label */}
      <div style={sectionLabel}>Appearance</div>

      {/* Theme toggle */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 20,
        padding: 6,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['light', 'dark'] as Mode[]).map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => onSetMode(m)}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  cursor: 'pointer',
                  padding: 12,
                  borderRadius: 15,
                  fontSize: 14,
                  fontWeight: 600,
                  border: 'none',
                  fontFamily: 'inherit',
                  transition: 'background 0.2s, color 0.2s',
                  background: active ? 'var(--accent)' : 'transparent',
                  color: active ? 'var(--accent-ink)' : 'var(--muted)',
                }}
              >
                {m === 'light' ? '☀ Light' : '☾ Dark'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Account section — logout */}
      <div style={{ ...sectionLabel, margin: '20px 0 10px' }}>Account</div>
      <button
        onClick={onLogout}
        style={{
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--cardsh)',
          borderRadius: 16,
          padding: '14px 16px',
          fontSize: 14.5,
          fontWeight: 700,
          fontFamily: 'inherit',
          color: '#d9534f',
        }}
      >
        Log out
      </button>
    </>
  )
}

// ── Saved (cp06) ────────────────────────────────────────────────────────────

function SavedSection({ onOpen, onBrowse }: { onOpen: (r: RecipeResponse) => void; onBrowse: () => void }) {
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useSavedRecipes()

  // Flatten pages, de-duping by id (defensive against cursor-edge overlap).
  const recipes = useMemo(() => {
    const seen = new Set<string>()
    const out: RecipeResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const r of page.items) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          out.push(r)
        }
      }
    }
    return out
  }, [data])

  if (isLoading) {
    return <StateBlock title="Loading saved recipes…" body="Fetching your bookmarks." />
  }
  if (isError) {
    return (
      <StateBlock
        title="Couldn't load your saved recipes"
        body="Something went wrong reaching the kitchen. Check your connection and try again."
        action={{ label: 'Try again', onClick: () => refetch() }}
      />
    )
  }
  if (recipes.length === 0) {
    return (
      <StateBlock
        title="Nothing saved yet"
        body="Tap the flag on any recipe to keep it here for later."
        action={{ label: 'Browse recipes', onClick: onBrowse }}
      />
    )
  }

  return (
    <>
      {/* Saved cards go through the shared social layer; savedByMe is KNOWN
          true here (the recipe came from the saved list), so seed it. */}
      {recipes.map((r) => (
        <SocialRecipeCard key={r.id} recipe={r} seed={{ savedByMe: true }} onOpen={() => onOpen(r)} />
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
            {isFetching ? 'Loading…' : "That's everything you've saved."}
          </span>
        )}
      </div>
    </>
  )
}

// ── Pieces / styles ─────────────────────────────────────────────────────────

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{
      flex: 1,
      textAlign: 'center',
      background: 'var(--surface2)',
      borderRadius: 12,
      padding: '8px 6px',
    }}>
      <div style={{ fontSize: 15.5, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
    </div>
  )
}

const sectionLabel: CSSProperties = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  fontWeight: 700,
  margin: '6px 0 10px',
}

const sectionChip: CSSProperties = {
  flex: 1,
  fontSize: 13,
  fontWeight: 700,
  padding: '9px 15px',
  borderRadius: 999,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
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
