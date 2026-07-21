import type { ComponentType } from 'react'
import { ChatIcon, FeedIcon, LibraryIcon, ProfileIcon, type IconProps } from './navIcons'

export type TabId = 'feed' | 'chat' | 'library' | 'profile'

// social-feed cp05 — sanctioned additive edit: the Feed tab (kickoff: "Feed
// tab added to Sidebar/BottomNav"). Both nav surfaces render NAV_ITEMS, so
// this is the whole change; default landing stays /library (product call).
//
// `icon` is a component (see navIcons.tsx), not a text glyph: the surfaces pass
// a `size`, and every icon renders at exactly that size.
export const NAV_ITEMS: { id: TabId; to: string; icon: ComponentType<IconProps>; label: string }[] = [
  { id: 'feed', to: '/feed', icon: FeedIcon, label: 'Feed' },
  { id: 'chat', to: '/chat', icon: ChatIcon, label: 'Chat' },
  { id: 'library', to: '/library', icon: LibraryIcon, label: 'Library' },
  { id: 'profile', to: '/profile', icon: ProfileIcon, label: 'Profile' },
]

/**
 * Desktop nav — same tabs minus Profile: on desktop the sidebar footer avatar
 * (expanded) / rail avatar (collapsed) is the single entry point to /profile,
 * so a duplicate nav pill would be redundant. Mobile keeps the full NAV_ITEMS.
 */
export const DESKTOP_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== 'profile')

/**
 * The recipe surfaces (/recipes/*) live under the Library tab. Callers pass the
 * BACKDROP path (see recipeCanvas.ts), not the raw URL, so a recipe opened from
 * chat or the feed keeps that tab lit instead of jumping the highlight here.
 */
export function activeTab(pathname: string): TabId {
  if (pathname.startsWith('/feed')) return 'feed'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'library'
}
