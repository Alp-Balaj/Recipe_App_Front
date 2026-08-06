import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as routeChunks from './routeChunks'

// ─────────────────────────────────────────────────────────────────────────
// Route-level code splitting (stream F, Task 2) — a SOURCE-level guard.
//
// This is not the usual behavioural test, and the shape is deliberate. The
// failure mode being pinned is silent: a static `import SomePage from
// '@/pages/SomePage'` anywhere in the app pins that module into the entry
// chunk, and the lazy import in routeChunks.tsx quietly stops splitting it.
// Nothing throws, no test goes red, every page still renders — the only
// symptom is the entry bundle creeping back toward the 688 kB it was, which
// no runtime assertion can see. Vite says so at build time and then the line
// scrolls past in CI output.
//
// That is exactly how the seven AppShell pages got into this state in the
// first place: the shell needed them for its desktop backdrop, imported them
// the obvious way, and the router's later lazy() calls were no-ops from then
// on. So the invariant is asserted where it actually lives — in the text of
// the two files that render pages.
// ─────────────────────────────────────────────────────────────────────────

function source(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

/** `import Foo from '@/pages/Foo'` or `'./pages/Foo'` — the static form. */
const STATIC_PAGE_IMPORT = /import\s+[^{;]*?\s+from\s+['"](?:@\/|\.\/|\.\.\/)pages\//g

describe('route-level code splitting', () => {
  it('declares every page lazily in one place', () => {
    // 17 page components + the `page()` helper. If an eighteenth page module
    // is ever added to the router it belongs here too, and this count is the
    // reminder. (Stream K raised it from 16 when /welcome's OnboardingPage
    // landed — the reminder worked exactly as intended.)
    const pages = Object.keys(routeChunks).filter((k) => k !== 'page')
    expect(pages).toHaveLength(17)

    // React.lazy returns an exotic object, not a function component — the
    // $$typeof tag is what distinguishes it from a directly-imported page.
    for (const name of pages) {
      const exported = routeChunks[name as keyof typeof routeChunks]
      expect(exported, `${name} must be lazy, not a static import`).toMatchObject({
        $$typeof: expect.anything(),
        _payload: expect.anything(),
      })
    }
  })

  it('keeps static page imports out of the two files that render pages', () => {
    // routeChunks.tsx itself is exempt by construction: its imports are the
    // dynamic `import()` form inside lazy(), which this pattern does not match.
    for (const file of ['router.tsx', 'components/AppShell.tsx']) {
      const matches = source(file).match(STATIC_PAGE_IMPORT) ?? []
      expect(
        matches,
        `${file} statically imports a page, which silently un-splits it — ` +
          'import it from src/routeChunks.tsx instead',
      ).toEqual([])
    }
  })
})
