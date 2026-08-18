import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup, configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { server } from './msw/server'
import { setSessionActive, setUnauthorizedHandler } from '@/api/client'

// ── findBy* timeout ──────────────────────────────────────────────────────
// Raised from Testing Library's 1000ms default (stream F, Task 2). Route-level
// code splitting means `renderRoute` now resolves a dynamic import before the
// page component exists, where previously every page was already in the module
// graph — one extra async hop before the first paint of every routed test.
//
// That hop is nothing in isolation (these files pass individually in ~4s), but
// the suite runs 43 jsdom files in parallel and two profile tests sat close
// enough to 1000ms that the extra tick pushed them over intermittently. This is
// the honest fix: the assertions were never wrong and the app is not slower —
// the budget for "the page has mounted" simply has one more step in it now.
// Raising it here rather than in 43 files keeps it one decision.
configure({ asyncUtilTimeout: 5000 })

// Node 22 ships an experimental native `localStorage` global that shadows
// jsdom's and exposes no getItem/setItem/removeItem. Install a Map-backed
// Storage so the auth store's persistence behaves normally under test.
function installLocalStorage() {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true, writable: true })
}
installLocalStorage()

// ── MSW ──────────────────────────────────────────────────────────────────
// Unhandled requests bypass rather than error: pages that fetch real endpoints
// (the lanes' work) shouldn't fail the auth suite just for lacking a handler.
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

afterEach(() => {
  cleanup()
  // Reset cross-test module state in the fetch wrapper + the session marker.
  // KAN-20: there is no token to reset any more — what the wrapper holds is its
  // BELIEF about whether a session is live, which decides whether a 401 triggers
  // a refresh or is passed through as a guest's.
  localStorage.clear()
  setSessionActive(false)
  setUnauthorizedHandler(null)
})

// jsdom has no matchMedia; the shell's useMediaQuery needs a working stub.
// matches: false → tests exercise the mobile/tablet layout branch.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// jsdom has neither Web Speech API (stream O). Baseline no-op stubs so cook
// mode's voice affordances exist under test; tests that assert on speech
// install the controllable fakes from @/test/speech instead, and
// capability-absence tests delete these via removeSpeechApis().
import { installSpeechStubs } from './speech'

installSpeechStubs()
