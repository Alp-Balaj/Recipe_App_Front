import type { ComponentType } from 'react'
import { ChatIcon, DiscoverIcon, FeedIcon, PlanIcon, ProfileIcon, ShopIcon, type IconProps } from './navIcons'

export type TabId = 'feed' | 'chat' | 'discover' | 'plan' | 'shop' | 'profile'

// social-feed cp05 — sanctioned additive edit: the Feed tab (kickoff: "Feed
// tab added to Sidebar/BottomNav"). Both nav surfaces render NAV_ITEMS, so
// this is the whole change; default landing stays /discover (product call).
//
// `icon` is a component (see navIcons.tsx), not a text glyph: the surfaces pass
// a `size`, and every icon renders at exactly that size.
export const NAV_ITEMS: { id: TabId; to: string; icon: ComponentType<IconProps>; label: string }[] = [
  { id: 'feed', to: '/feed', icon: FeedIcon, label: 'Feed' },
  { id: 'chat', to: '/chat', icon: ChatIcon, label: 'Chat' },
  { id: 'discover', to: '/discover', icon: DiscoverIcon, label: 'Discover' },
  // week/shopping rework, Task 9 — the week is where users spend most of their
  // planning time, so the Plan tab now lands there directly (via the additive
  // /plan/week redirect) instead of the month; the month stays one tap away
  // via the week's own "Month" link. Shopping gets its own tab below: sharing
  // Plan was a DATA relationship (the list is generated from the week), not a
  // USAGE one — planning happens at a table, shopping happens one-handed in
  // an aisle, and those are different destinations.
  { id: 'plan', to: '/plan/week', icon: PlanIcon, label: 'Plan' },
  { id: 'shop', to: '/shopping-list', icon: ShopIcon, label: 'Shop' },
  { id: 'profile', to: '/profile', icon: ProfileIcon, label: 'Profile' },
]

/**
 * Desktop nav — same tabs minus Profile: on desktop the sidebar footer avatar
 * (expanded) / rail avatar (collapsed) is the single entry point to /profile,
 * so a duplicate nav pill would be redundant. Mobile keeps the full NAV_ITEMS.
 */
export const DESKTOP_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== 'profile')

/**
 * The recipe surfaces (/recipes/*) live under the Discover tab. Callers pass the
 * BACKDROP path (see recipeCanvas.ts), not the raw URL, so a recipe opened from
 * chat or the feed keeps that tab lit instead of jumping the highlight here.
 *
 * week/shopping rework, Task 9 — REVIEWED COMMIT against this frozen module.
 * /shopping-list used to fold into the /plan branch below via an OR (`/plan`
 * and `/shopping-list` shared the Plan tab on the theory that the list is
 * generated from the week, so they read as one destination — a DATA
 * relationship, not a USAGE one). It now lights its own Shop tab, so its
 * check is split out and placed BEFORE the /plan check: were the /plan check
 * to run first with the old OR still in place, /shopping-list would keep
 * lighting Plan instead of Shop.
 */
export function activeTab(pathname: string): TabId {
  if (pathname.startsWith('/feed')) return 'feed'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/shopping-list')) return 'shop'
  if (pathname.startsWith('/plan')) return 'plan'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'discover'
}
