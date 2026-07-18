// ─────────────────────────────────────────────────────────────────────────
// The one user avatar (social-feed cp06 — extracted from FeedPostCard so the
// comment rows and profile pages share it). Initials-on-gradient fallback
// (decision I4: no avatar upload in v1; profileImageUrl renders when present),
// using the shared warm gradientFor keyed by the user id.
// ─────────────────────────────────────────────────────────────────────────

import { resolveImageUrl } from '@/lib/images'
import { gradientFor } from '@/pages/recipeVisuals'

interface AvatarProps {
  username: string
  profileImageUrl?: string | null
  /** Gradient seed — the user id (stable even if the username ever changes). */
  seed: string
  /** Diameter in px. The feed card header uses 32; profile blocks go bigger. */
  size?: number
}

export default function Avatar({ username, profileImageUrl, seed, size = 32 }: AvatarProps) {
  return (
    <div
      aria-hidden
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.42),
        fontWeight: 800,
        color: '#fff',
        ...(profileImageUrl
          ? {
              backgroundImage: `url(${resolveImageUrl(profileImageUrl)})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : { background: gradientFor(seed || username) }),
      }}
    >
      {profileImageUrl ? null : username.slice(0, 1).toUpperCase()}
    </div>
  )
}
