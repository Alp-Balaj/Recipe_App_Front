// Relative-time formatting (social-feed cp06 — extracted from FeedPostCard so
// the comment rows share the exact same wording as the post-card timestamp).

/** "just now" / "12m ago" / "5h ago" / "3d ago" / "12 Jul". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
