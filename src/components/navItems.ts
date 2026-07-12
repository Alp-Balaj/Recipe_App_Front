export type TabId = 'chat' | 'library' | 'profile'

export const NAV_ITEMS: { id: TabId; to: string; icon: string; label: string }[] = [
  { id: 'chat', to: '/chat', icon: '◌', label: 'Chat' },
  { id: 'library', to: '/library', icon: '▤', label: 'Library' },
  { id: 'profile', to: '/profile', icon: '◍', label: 'Profile' },
]

/** The recipe surfaces (/recipes/*) live under the Library tab. */
export function activeTab(pathname: string): TabId {
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'library'
}
