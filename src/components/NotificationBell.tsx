// ─────────────────────────────────────────────────────────────────────────
// The bell (open-loops slice 3).
//
// Why not a seventh nav tab: navItems.ts is frozen and already carries six,
// which is as many as a mobile bottom bar can hold legibly. The bell is chrome
// instead — it lives beside the avatar in the desktop sidebar and in the
// mobile shell's top band, and it navigates to the /notifications route.
//
// The dot is a dot, not a number, below a threshold nobody counts past: "you
// have things waiting" is the whole message, and an exact 47 is noise.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { useUnreadCount } from '@/hooks/useNotifications'

interface Props {
  /** Icon size in px — the three mount points have three different geometries. */
  size?: number
  style?: CSSProperties
}

export default function NotificationBell({ size = 20, style }: Props) {
  const { data } = useUnreadCount()
  const unread = data?.unreadCount ?? 0
  const label = unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'

  return (
    <Link
      to="/notifications"
      aria-label={label}
      title={label}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 14,
        height: size + 14,
        borderRadius: 999,
        color: 'var(--muted)',
        textDecoration: 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3a6 6 0 0 0-6 6v3.6L4.6 15.2A1 1 0 0 0 5.5 16.7h13a1 1 0 0 0 .9-1.5L18 12.6V9a6 6 0 0 0-6-6Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path d="M9.8 19.4a2.4 2.4 0 0 0 4.4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      {unread > 0 && (
        // aria-hidden: the count is already in the link's accessible name, so
        // announcing it twice would just be chatter.
        <span aria-hidden style={dot} />
      )}
    </Link>
  )
}

const dot: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 6,
  width: 9,
  height: 9,
  borderRadius: 999,
  background: 'var(--accent)',
  border: '2px solid var(--surface)',
}
