// Client-side boolean preferences persisted to localStorage. The Notifications and
// Privacy settings screens have no backend surface yet, so these toggles are honest
// device-local prefs rather than dead switches. Keys are namespaced under `pref:`.

import { useCallback, useState } from 'react'

export function useLocalPref(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const storageKey = `pref:${key}`

  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? fallback : raw === 'true'
    } catch {
      return fallback
    }
  })

  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
        // Storage unavailable (private mode / quota) — keep the in-memory value.
      }
    },
    [storageKey],
  )

  return [value, set]
}
