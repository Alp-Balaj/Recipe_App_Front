// Share = Web Share API with clipboard fallback (social-feed cp05).

export type ShareOutcome = 'shared' | 'copied' | 'dismissed' | 'failed'

/**
 * Share a link via the native share sheet when the browser has one, falling
 * back to copying the URL to the clipboard. A user-dismissed share sheet
 * (AbortError) is 'dismissed', not a failure — no fallback fires for it.
 */
export async function shareLink(title: string, url: string): Promise<ShareOutcome> {
  const nav = navigator as Navigator & { share?: (data: { title: string; url: string }) => Promise<void> }
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ title, url })
      return 'shared'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'dismissed'
      // Share sheet unavailable/failed → fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
