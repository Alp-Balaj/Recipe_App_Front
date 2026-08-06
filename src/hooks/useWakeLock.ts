// ─────────────────────────────────────────────────────────────────────────
// Screen wake lock for cook mode (stream M).
//
// The single most useful thing cook mode does, and the least visible: a phone
// propped against a mixing bowl locks its screen after thirty seconds, and
// unlocking it with wet or floury hands is the whole reason people give up on
// reading a recipe from a phone.
//
// Three things the API forces on any honest implementation:
//
//   1. It is NOT universally available (no Safari before 16.4, no Firefox at
//      the time of writing) and it is only granted on a secure context. So the
//      hook is entirely best-effort and reports whether it actually holds one
//      — a surface that CLAIMS to keep the screen awake and does not is worse
//      than one that never promised.
//   2. The browser RELEASES it whenever the document is hidden — a call, a
//      switch to a timer app — and does not give it back on return. Without
//      the visibilitychange re-acquire below, the lock silently survives
//      exactly until the first interruption, which is when it was needed.
//   3. request() rejects rather than returning null when refused (low battery
//      is the common one), so every call is wrapped.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'

/**
 * Holds a screen wake lock while `active`. Returns whether one is actually
 * held right now — false on a browser without the API, on an insecure origin,
 * or when the request was refused.
 */
export function useWakeLock(active: boolean): boolean {
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) {
      setHeld(false)
      return
    }

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release().catch(() => {})
          sentinel = null
          return
        }
        setHeld(true)
        // The browser may drop it on its own (battery saver kicking in); the
        // listener is what keeps `held` honest rather than optimistic.
        sentinel.addEventListener('release', () => {
          if (!cancelled) setHeld(false)
        })
      } catch {
        setHeld(false)
      }
    }

    // Re-acquire on return: point 2 above, and the difference between a wake
    // lock that works and one that works until you answer a message.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire()
      else setHeld(false)
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      setHeld(false)
      if (sentinel) void sentinel.release().catch(() => {})
    }
  }, [active])

  return held
}
