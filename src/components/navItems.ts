export type TabId = 'feed' | 'chat' | 'library' | 'profile'

// social-feed cp05 — sanctioned additive edit: the Feed tab (kickoff: "Feed
// tab added to Sidebar/BottomNav"). Both nav surfaces render NAV_ITEMS, so
// this is the whole change; default landing stays /library (product call).
export const NAV_ITEMS: { id: TabId; to: string; icon: string; label: string }[] = [
  { id: 'feed', to: '/feed', icon: '✦', label: 'Feed' },
  { id: 'chat', to: '/chat', icon: '◌', label: 'Chat' },
  { id: 'library', to: '/library', icon: '▤', label: 'Library' },
  { id: 'profile', to: '/profile', icon: '◍', label: 'Profile' },
]

/** The recipe surfaces (/recipes/*) live under the Library tab. */
export function activeTab(pathname: string): TabId {
  if (pathname.startsWith('/feed')) return 'feed'
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'library'
}
