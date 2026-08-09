// ─────────────────────────────────────────────────────────────────────────
// The /feed right rail (feed redesign, 2026-08-09).
//
// Replaces the old discovery rail — "Suggested cooks" with a reason-less "In
// your feed" line, plus a cloud of trending tags. The brief for every module
// here is that it must do a REAL job: say something the feed column doesn't
// already say, and give the reader somewhere to go.
//
//   1. Cooking right now  — what followed cooks just did (GET /feed/activity).
//   2. On your plan       — this week's plan, cross-referenced with the feed so
//                           a planned dish that just showed up says so.
//   3. Saved, not cooked  — the saved shelf minus anything already planned or
//                           already cooked (For You only).
//   4. Cooks              — For You: suggestions WITH a computed reason.
//                           Following: who you follow and who has posted.
//
// Every module is derived from data the app already has; nothing here invents
// a number. Where a reason cannot be computed honestly the row falls back to a
// plainer one rather than a fabricated one — see reasonFor() below.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '@/components/Avatar'
import { useAuth } from '@/auth/AuthContext'
import { useFeedActivity } from '@/hooks/useFeedActivity'
import { useFollowList } from '@/hooks/useFollowList'
import { useCurrentWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import { useSavedRecipes } from '@/hooks/useSavedRecipes'
import { DAY_ORDER, weekStartOf, type MealPlanEntry } from '@/api/mealPlans'
import type { FeedActivityKind, FeedItemResponse, FeedScope, UserSummaryResponse } from '@/api/social'
import type { RecipeResponse } from '@/api/types'
import { resolveImageUrl } from '@/lib/images'
import { timeAgo } from '@/lib/time'
import { gradientFor } from '@/pages/recipeVisuals'

export interface FeedRailProps {
  items: FeedItemResponse[]
  tab: FeedScope
  /** The caller's following set — lifted to the page so the card and rail agree. */
  followedIds: Set<string>
  onOpenAuthor: (id: string) => void
  onOpenRecipe: (id: string) => void
  onToggleFollow: (userId: string, next: boolean) => void
}

export default function FeedRail(props: FeedRailProps) {
  const { tab } = props
  const { user } = useAuth()

  // Every module reads an account-scoped endpoint — the week's plan, the saved
  // shelf, the follow list. For a guest they would all answer 401, and the
  // fetch wrapper treats any 401 as a dead session, so a guest browsing /feed
  // would be signed out by the rail. A guest gets no rail at all instead.
  if (!user) return null

  return (
    <aside
      style={{
        width: 300,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        // The column is long and the rail is short: sticking it keeps the
        // modules reachable instead of stranding them at the top of a scroll.
        // 28 matches the page's own top padding, so the rail settles where it
        // started rather than jamming against the scrollport edge.
        position: 'sticky',
        top: 28,
        alignSelf: 'flex-start',
      }}
    >
      <CookingRightNow {...props} />
      <OnYourPlan {...props} />
      {/* The saved shelf is a For You prompt: the Following tab is about the
          people you follow, and a nudge about your own backlog belongs with
          the browsing tab, not with them. */}
      {tab === 'forYou' && <SavedNotCooked {...props} />}
      {tab === 'forYou' ? <SuggestedCooks {...props} /> : <CooksYouFollow {...props} />}
    </aside>
  )
}

// ── 1. Cooking right now ────────────────────────────────────────────────────

const ACTIVITY_VERB: Record<FeedActivityKind, string> = {
  Posted: 'posted',
  Liked: 'liked',
  Saved: 'saved',
  Cooked: 'made',
}

function CookingRightNow({ tab, onOpenRecipe }: FeedRailProps) {
  const { data } = useFeedActivity(tab)
  const rows = (data?.items ?? []).slice(0, 3)
  if (rows.length === 0) return null

  return (
    <Module
      label="COOKING RIGHT NOW"
      // The live dot is the whole reason this module reads as "right now"
      // rather than as another list.
      dot
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((row) => (
          <div key={`${row.actor.id}-${row.recipeId}-${row.kind}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar username={row.actor.username} profileImageUrl={row.actor.profileImageUrl} seed={row.actor.id} size={30} />
            <button
              onClick={() => onOpenRecipe(row.recipeId)}
              style={{
                ...bareButton,
                flex: 1,
                minWidth: 0,
                textAlign: 'left',
                fontSize: 13,
                lineHeight: 1.35,
                color: 'var(--muted)',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{row.actor.username}</span>{' '}
              {ACTIVITY_VERB[row.kind]} <span style={{ color: 'var(--text)' }}>{row.recipeTitle}</span>
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{shortAgo(row.occurredAt)}</span>
          </div>
        ))}
      </div>
    </Module>
  )
}

// ── 2. On your plan this week ───────────────────────────────────────────────

function OnYourPlan({ items, tab, onOpenRecipe }: FeedRailProps) {
  const navigate = useNavigate()
  const weekStart = useMemo(() => weekStartOf(new Date()), [])
  const { planId } = useCurrentWeekPlan(weekStart)
  const { data: plan } = useMealPlanDetail(planId)

  // A recipe planned twice in a week is two entries; the rail wants dishes, so
  // the first (earliest day) entry per recipe wins.
  const rows = useMemo(() => {
    const byRecipe = new Map<string, MealPlanEntry>()
    const entries = [...(plan?.entries ?? [])].sort(
      (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek),
    )
    for (const entry of entries) {
      if (!byRecipe.has(entry.recipe.id)) byRecipe.set(entry.recipe.id, entry)
    }

    const feedById = new Map(items.map((i) => [i.recipe.id, i]))
    const withReason = Array.from(byRecipe.values()).map((entry) => ({
      entry,
      feedItem: feedById.get(entry.recipe.id),
    }))

    // Following narrows to "the thing a cook you follow just posted" — on that
    // tab an unrelated planned dish is not news. For You shows the next two.
    const relevant = tab === 'following' ? withReason.filter((r) => r.feedItem) : withReason
    return relevant.slice(0, tab === 'following' ? 1 : 2)
  }, [plan, items, tab])

  if (rows.length === 0) return null

  return (
    <Module label="ON YOUR PLAN THIS WEEK" action={{ label: 'Plan ›', onClick: () => navigate('/plan') }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(({ entry, feedItem }) => {
          const reason = planReason(feedItem)
          return (
            <button
              key={entry.id}
              onClick={() => onOpenRecipe(entry.recipe.id)}
              style={{ ...bareButton, display: 'flex', gap: 11, alignItems: 'center', textAlign: 'left', width: '100%' }}
            >
              <Thumb seed={entry.recipe.id} imageUrl={entry.recipe.imageUrl} width={52} height={46} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...ellipsis, display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                  {entry.dayOfWeek.slice(0, 3)} · {entry.recipe.title}
                </span>
                <span
                  style={{
                    ...ellipsis,
                    display: 'block',
                    fontSize: 11.5,
                    marginTop: 2,
                    // Accent = a social reason (someone you follow did something
                    // about this dish); muted = plain provenance.
                    color: reason.social ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {reason.text}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </Module>
  )
}

/**
 * Why a planned dish is worth mentioning. Only the feed can supply a social
 * reason, so a dish that isn't in the loaded feed gets plain provenance rather
 * than an invented "2 cooks you follow made it".
 */
function planReason(feedItem: FeedItemResponse | undefined): { text: string; social: boolean } {
  if (feedItem) {
    if (feedItem.madeItCount > 0) {
      return {
        text: `${feedItem.madeItCount} ${feedItem.madeItCount === 1 ? 'cook' : 'cooks'} made it`,
        social: true,
      }
    }
    return { text: `${feedItem.author.username} just posted this`, social: true }
  }
  return { text: 'on your plan this week', social: false }
}

// ── 3. Saved, not yet cooked ────────────────────────────────────────────────

function SavedNotCooked({ items, onOpenRecipe }: FeedRailProps) {
  const navigate = useNavigate()
  const weekStart = useMemo(() => weekStartOf(new Date()), [])
  const { planId } = useCurrentWeekPlan(weekStart)
  const { data: plan } = useMealPlanDetail(planId)
  const { data: saved } = useSavedRecipes()

  const shelf = useMemo(() => {
    const plannedIds = new Set((plan?.entries ?? []).map((e) => e.recipe.id))
    // The feed envelope is the only place that knows whether the caller cooked
    // something — the saved list is plain RecipeResponses. A recipe outside the
    // loaded feed is simply not excluded, which errs toward showing it.
    const cookedIds = new Set(items.filter((i) => i.cookedByMe).map((i) => i.recipe.id))
    const out: RecipeResponse[] = []
    for (const page of saved?.pages ?? []) {
      for (const recipe of page.items) {
        if (plannedIds.has(recipe.id) || cookedIds.has(recipe.id)) continue
        out.push(recipe)
      }
    }
    return out
  }, [saved, plan, items])

  if (shelf.length === 0) return null

  return (
    <Module
      label="SAVED, NOT YET COOKED"
      action={{ label: `All ${shelf.length} ›`, onClick: () => navigate('/profile') }}
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 11 }}>
        {shelf.slice(0, 3).map((recipe) => (
          <button
            key={recipe.id}
            onClick={() => onOpenRecipe(recipe.id)}
            aria-label={recipe.title}
            style={{
              ...bareButton,
              flex: 1,
              minWidth: 0,
              height: 60,
              borderRadius: 11,
              ...thumbBackground(recipe.id, recipe.imageUrl),
            }}
          />
        ))}
      </div>
      <button
        onClick={() => navigate('/plan')}
        style={{
          width: '100%',
          cursor: 'pointer',
          border: 'none',
          borderRadius: 11,
          padding: 9,
          fontFamily: 'inherit',
          fontSize: 12.5,
          fontWeight: 700,
          background: 'var(--chipbg)',
          color: 'var(--accent)',
        }}
      >
        Add one to this week
      </button>
    </Module>
  )
}

// ── 4a. Cooks who share your taste (For You) ────────────────────────────────

function SuggestedCooks({ items, followedIds, onOpenAuthor, onToggleFollow }: FeedRailProps) {
  const { user } = useAuth()
  const { data: saved } = useSavedRecipes()

  const cooks = useMemo(() => {
    // How many of THEIR recipes the caller has already saved — the strongest
    // honest taste signal available on the client.
    const savedByAuthor = new Map<string, number>()
    for (const page of saved?.pages ?? []) {
      for (const recipe of page.items) {
        savedByAuthor.set(recipe.createdByUserId, (savedByAuthor.get(recipe.createdByUserId) ?? 0) + 1)
      }
    }

    const seen = new Map<string, { author: UserSummaryResponse; inFeed: number }>()
    for (const item of items) {
      if (item.author.id === user?.userId) continue
      if (followedIds.has(item.author.id)) continue
      const entry = seen.get(item.author.id)
      if (entry) entry.inFeed += 1
      else seen.set(item.author.id, { author: item.author, inFeed: 1 })
    }

    return Array.from(seen.values())
      .map((c) => ({ ...c, saved: savedByAuthor.get(c.author.id) ?? 0 }))
      // Strongest signal first: people whose recipes you already save, then
      // people who fill the most of your feed.
      .sort((a, b) => b.saved - a.saved || b.inFeed - a.inFeed)
      .slice(0, 3)
  }, [items, followedIds, saved, user])

  if (cooks.length === 0) return null

  return (
    <Module label="COOKS WHO SHARE YOUR TASTE">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {cooks.map((cook) => (
          <div key={cook.author.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Avatar
              username={cook.author.username}
              profileImageUrl={cook.author.profileImageUrl}
              seed={cook.author.id}
              size={38}
            />
            <button
              onClick={() => onOpenAuthor(cook.author.id)}
              style={{ ...bareButton, flex: 1, minWidth: 0, textAlign: 'left' }}
            >
              <span style={{ ...ellipsis, display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                {cook.author.username}
              </span>
              <span style={{ ...ellipsis, display: 'block', fontSize: 11.5, marginTop: 1, color: 'var(--accent)' }}>
                {suggestionReason(cook.saved, cook.inFeed)}
              </span>
            </button>
            <button
              onClick={() => onToggleFollow(cook.author.id, true)}
              style={{
                flexShrink: 0,
                cursor: 'pointer',
                border: 'none',
                borderRadius: 999,
                padding: '6px 13px',
                fontFamily: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                background: 'var(--accent-fill)',
                color: 'var(--accent-ink)',
              }}
            >
              Follow
            </button>
          </div>
        ))}
      </div>
    </Module>
  )
}

/**
 * Why this cook. Both branches are facts the client can check; when neither
 * holds, the row says the plain true thing rather than an invented affinity.
 */
function suggestionReason(savedCount: number, inFeed: number): string {
  if (savedCount > 0) {
    return `you saved ${savedCount} of their recipe${savedCount === 1 ? '' : 's'}`
  }
  if (inFeed > 1) return `${inFeed} recipes in your feed`
  return 'New to your feed'
}

// ── 4b. Cooks you follow (Following) ────────────────────────────────────────

/** A post inside this window earns the "New" badge. */
const NEW_POST_WINDOW_MS = 24 * 60 * 60 * 1000

function CooksYouFollow({ items, onOpenAuthor }: FeedRailProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const followList = useFollowList(user?.userId, 'following')

  const rows = useMemo(() => {
    // Newest post per author, out of the feed the tab already loaded.
    const latest = new Map<string, string>()
    for (const item of items) {
      const current = latest.get(item.author.id)
      if (!current || item.recipe.createdAt > current) latest.set(item.author.id, item.recipe.createdAt)
    }
    const all: UserSummaryResponse[] = []
    for (const page of followList.data?.pages ?? []) all.push(...page.items)
    return {
      total: all.length,
      // Whoever posted most recently leads; cooks with nothing in this feed sink.
      visible: all
        .map((u) => ({ user: u, lastPost: latest.get(u.id) }))
        .sort((a, b) => (b.lastPost ?? '').localeCompare(a.lastPost ?? ''))
        .slice(0, 5),
    }
  }, [followList.data, items])

  if (rows.visible.length === 0) return null

  return (
    <Module
      label="COOKS YOU FOLLOW"
      action={{ label: `All ${rows.total} ›`, onClick: () => navigate('/profile') }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.visible.map(({ user: cook, lastPost }) => {
          // "New" means posted in the last day. The app tracks no per-user seen
          // state, so this is what "unseen" can honestly mean here.
          const isNew = lastPost !== undefined && Date.now() - new Date(lastPost).getTime() < NEW_POST_WINDOW_MS
          return (
            <div key={cook.id} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Avatar username={cook.username} profileImageUrl={cook.profileImageUrl} seed={cook.id} size={36} />
              <button
                onClick={() => onOpenAuthor(cook.id)}
                style={{ ...bareButton, flex: 1, minWidth: 0, textAlign: 'left' }}
              >
                <span style={{ ...ellipsis, display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                  {cook.username}
                </span>
                <span style={{ ...ellipsis, display: 'block', fontSize: 11.5, marginTop: 1, color: 'var(--muted)' }}>
                  {lastPost ? `posted ${timeAgo(lastPost)}` : 'nothing new'}
                </span>
              </button>
              {isNew && (
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: 'var(--accent)',
                    background: 'var(--chipbg)',
                    borderRadius: 999,
                    padding: '3px 8px',
                  }}
                >
                  New
                </span>
              )}
            </div>
          )
        })}
      </div>
    </Module>
  )
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function Module({
  label,
  dot,
  action,
  children,
}: {
  label: string
  dot?: boolean
  action?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--cardsh)',
        borderRadius: 18,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
        {dot && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-fill)', flexShrink: 0 }} />
        )}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.11em', color: 'var(--muted)' }}>{label}</div>
        {action && (
          <button
            onClick={action.onClick}
            style={{ ...bareButton, marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function thumbBackground(seed: string, imageUrl?: string | null): CSSProperties {
  return imageUrl
    ? {
        backgroundImage: `url(${resolveImageUrl(imageUrl)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: gradientFor(seed) }
}

function Thumb({
  seed,
  imageUrl,
  width,
  height,
}: {
  seed: string
  imageUrl?: string | null
  width: number
  height: number
}) {
  return (
    <span
      style={{ flexShrink: 0, width, height, borderRadius: 11, display: 'block', ...thumbBackground(seed, imageUrl) }}
    />
  )
}

/** "8m" / "1h" / "2d" — timeAgo without the "ago", for the tight activity rows. */
function shortAgo(iso: string): string {
  return timeAgo(iso).replace(' ago', '').replace('just now', 'now')
}

const bareButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const ellipsis: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
