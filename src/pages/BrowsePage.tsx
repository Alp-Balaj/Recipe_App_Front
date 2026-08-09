// ─────────────────────────────────────────────────────────────────────────
// Discover (/discover) — the editorial front page (Discover redesign).
//
// Was: a header, a search field, a row of difficulty pills, an always-open
// cuisine/tag panel, and then one flat "Trending now" card list. Every visitor
// paid a screenful of controls before reaching a recipe, and the page had no
// opinion about what to cook.
//
// Now the page has two modes, and which one you get is decided by whether you
// have asked it anything:
//
//   BROWSING (no search, no filters) — the front page. One cover story, the
//   scan band, then three ruled departments (Trending / Quick tonight / From
//   your people). Editorial, finite, no pagination: it is a front page, not a
//   catalogue.
//
//   SEARCHING (any filter or search term) — the flat result list with Load
//   more, unchanged from before. A query deserves results, not a magazine.
//
//   A DEPARTMENT ("All ›" on a section) — the same flat list, but titled and
//   with "‹ Back to Discover" over it, because you got here by following a link
//   rather than by asking a question, and a link you did not mean to follow has
//   to be undoable. See `Department` below for why this is state of its own and
//   not just a filter.
//
// The filter controls moved into a sheet behind a "Filters (n)" button; the
// count on that button is the only filter state shown outside it. The search
// wiring (300ms debounce → server-side ?search=) and the pagination are
// untouched — this is a composition change, not a data one.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import SocialRecipeCard from '@/components/SocialRecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import Avatar from '@/components/Avatar'
import DiscoverHero from '@/components/discover/DiscoverHero'
import EditorialSection, { type EditorialItem } from '@/components/discover/EditorialSection'
import FiltersSheet, { type FilterSelection } from '@/components/discover/FiltersSheet'
import ScanBand from '@/components/discover/ScanBand'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useFeed } from '@/hooks/useFeed'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useRecipeList, type BrowseFilters } from '@/hooks/useRecipeList'
import { TAGS } from '@/api/vocabulary'
import { formatRelativeTime } from '@/lib/relativeTime'
import type { Cuisine, Difficulty, RecipeResponse, RecipeTag } from '@/api/types'

/**
 * How long typing has to settle before the search term reaches the wire.
 * Matches IngredientNameField's debounce, the app's other type-ahead.
 */
const SEARCH_DEBOUNCE_MS = 300

/** "Quick tonight" — anything you could plausibly start after getting home. */
const QUICK_MAX_MINUTES = 20

/** Recipes per department: one lead image card plus two rows. */
const SECTION_SIZE = 3

/**
 * A department drilled into from its "All ›" link — the flat result list, but
 * named, so it is obvious what you are looking at and how to leave.
 *
 * This exists because the two "All ›" links used to leave by different doors:
 * Trending set a `browseAll` flag (which had a back button) while Quick tonight
 * wrote `['Quick']` straight into the user's tag state (which had none — the
 * only way out was opening the Filters sheet and un-picking a chip the user had
 * never picked). Modelling the view itself makes a link-applied filter
 * distinguishable from a user-applied one, which is what lets it be undone.
 */
interface Department {
  title: string
  subtitle: string
  /**
   * Rides along with the query, but is deliberately NEVER written into `tags`:
   * the sheet must keep showing only what the user chose, or "Filters (1)"
   * would claim a filter they did not pick and Back would have nothing to undo.
   */
  tags?: RecipeTag[]
}

const TRENDING_VIEW: Department = {
  title: 'Trending',
  subtitle: 'The whole catalogue.',
}

/**
 * Note the honest subtitle. The front-page section is computed client-side from
 * `totalTimeMinutes <= QUICK_MAX_MINUTES`, but this view filters by the `Quick`
 * TAG, because the list endpoint has no max-time parameter — so a 15-minute
 * recipe nobody tagged is in the section and not in here. Saying "under 20
 * minutes" would promise a set the query cannot return.
 */
const QUICK_VIEW: Department = {
  title: 'Quick tonight',
  subtitle: 'Tagged quick — on the table fast.',
  tags: ['Quick'],
}

export default function BrowsePage() {
  // BrowsePage also renders as the canvas BACKDROP, where `useLocation()` is a
  // /recipes/:id URL — useOpenRecipe carries the real backdrop through.
  const openRecipe = useOpenRecipe()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Committed filter state — each change produces a new query key, which resets
  // useInfiniteQuery pagination back to the first page automatically.
  const [cuisine, setCuisine] = useState<Cuisine | ''>('')
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(undefined)
  const [tags, setTags] = useState<RecipeTag[]>([])
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  // The department you drilled into via "All ›", or null for the front page.
  // Only those links open it, so the front page stays the default every time
  // you arrive.
  const [department, setDepartment] = useState<Department | null>(null)

  // open-loops slice 2: search moved to the SERVER. It used to filter only the
  // pages already loaded, so a recipe sitting on page four did not exist for
  // search until you had paged that far — the same silently-lossy bug that
  // GET /recipes/mine was created to fix for "My recipes".
  //
  // Two pieces of state: `search` is what the input shows (instant), and
  // `debouncedSearch` is what reaches the query key, so typing does not fire a
  // request per keystroke. Only the debounced value is a dependency below.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const filters: BrowseFilters = useMemo(
    () => ({
      cuisine: cuisine || undefined,
      difficulty,
      tags: department?.tags ? [...department.tags, ...tags] : tags,
      search: debouncedSearch,
    }),
    [cuisine, difficulty, tags, debouncedSearch, department],
  )

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useRecipeList(filters)

  // Flatten pages, de-duping by id (defensive against any cursor-edge overlap).
  const recipes = useMemo(() => {
    const seen = new Set<string>()
    const out: RecipeResponse[] = []
    for (const page of data?.pages ?? []) {
      for (const r of page.items) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          out.push(r)
        }
      }
    }
    return out
  }, [data])

  // The number on the Filters button. Search is deliberately NOT counted: it
  // has its own visible field, and counting it would make the button claim a
  // filter the sheet cannot show you.
  const activeFilterCount = (difficulty ? 1 : 0) + (cuisine ? 1 : 0) + tags.length
  const hasActiveFilters = activeFilterCount > 0 || !!search.trim()
  const isEditorial = !hasActiveFilters && !department

  const clearFilters = () => {
    setCuisine('')
    setDifficulty(undefined)
    setTags([])
    setSearch('')
  }

  // A department and a question of your own are mutually exclusive: asking one
  // closes the other. That is what keeps "‹ Back to Discover" honest — clearing
  // the department always lands on the front page, never on a still-filtered
  // list wearing a button that promised otherwise.
  const applyFilters = (next: FilterSelection) => {
    setCuisine(next.cuisine)
    setDifficulty(next.difficulty)
    setTags(next.tags)
    setDepartment(null)
  }

  const changeSearch = (term: string) => {
    setSearch(term)
    if (term.trim()) setDepartment(null)
  }

  // Tag ranking for the sheet's first eight chips. There is no usage-count
  // endpoint, so this is an honest client-side estimate over the page already
  // loaded — most-tagged first, with the rest of the vocabulary behind it in
  // its canonical order so nothing is ever unreachable.
  const tagRanking = useMemo(() => {
    const counts = new Map<RecipeTag, number>()
    for (const r of recipes) {
      for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...TAGS].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
  }, [recipes])

  // ── The front page's departments ──────────────────────────────────────────
  // All three read the list the page has ALREADY loaded — no second query, no
  // maxTime param the backend does not have. A department with nothing in it
  // renders nothing rather than an apologetic empty card.
  const hero = recipes[0]
  const trending = recipes.slice(1, 1 + SECTION_SIZE)
  const quick = useMemo(() => {
    const spoken = new Set(recipes.slice(0, 1 + SECTION_SIZE).map((r) => r.id))
    return recipes
      .filter((r) => !spoken.has(r.id) && r.totalTimeMinutes > 0 && r.totalTimeMinutes <= QUICK_MAX_MINUTES)
      .slice(0, SECTION_SIZE)
  }, [recipes])

  const pageStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    bottom: 'var(--nav-h, 74px)',
    overflowY: 'auto',
    padding: isDesktop ? '28px 34px 40px' : '26px 18px 16px',
  }

  // ── Result list: states, then the recipe surface (grid desktop, list mobile) ──
  const results = isLoading ? (
    <StateBlock title="Loading recipes…" body="Fetching the latest from the kitchen." />
  ) : isError ? (
    <StateBlock
      title="Couldn't load recipes"
      body="Something went wrong reaching the kitchen. Check your connection and try again."
      action={{ label: 'Try again', onClick: () => refetch() }}
    />
  ) : recipes.length === 0 ? (
    <StateBlock
      title="No recipes found"
      body={
        search.trim()
          ? `Nothing matches "${search.trim()}" — searched titles, descriptions and ingredients.`
          : hasActiveFilters
            ? 'No recipes match these filters yet. Try loosening them.'
            : department?.tags
              ? `Nothing in ${department.title} yet.`
              : 'Nothing here yet — be the first to add a recipe.'
      }
      action={
        hasActiveFilters
          ? { label: 'Clear filters', onClick: clearFilters }
          : department
            ? { label: 'Back to Discover', onClick: () => setDepartment(null) }
            : undefined
      }
    />
  ) : (
    <>
      {isDesktop ? (
        // A plain auto-fill card grid. minmax(260px) lands on three columns at
        // the design's content width and degrades to two/one when the recipe
        // canvas pane is open.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {recipes.map((r) => (
            <SocialRecipeCard key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />
          ))}
        </div>
      ) : (
        recipes.map((r) => <SocialRecipeCard key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />)
      )}

      <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 12px' }}>
        {hasNextPage ? (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            style={{ ...loadMoreBtn, opacity: isFetchingNextPage ? 0.6 : 1 }}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {isFetching ? 'Loading…' : "That's everything."}
          </span>
        )}
      </div>
    </>
  )

  // ── The three departments ────────────────────────────────────────────────
  const departments = (
    <>
      <EditorialSection
        index={1}
        title="Trending"
        isDesktop={isDesktop}
        items={trending.map((recipe) => ({ recipe }))}
        onOpen={openRecipe}
        onSeeAll={() => setDepartment(TRENDING_VIEW)}
      />
      <EditorialSection
        index={2}
        title="Quick tonight"
        isDesktop={isDesktop}
        items={quick.map((recipe, i): EditorialItem => ({
          recipe,
          // The lead card wears the time as a pill over the photo; the rows
          // keep it in the meta line, so it is never said twice.
          badge: i === 0 ? `${recipe.totalTimeMinutes} min` : undefined,
        }))}
        onOpen={openRecipe}
        onSeeAll={() => setDepartment(QUICK_VIEW)}
      />
      <FromYourPeople isDesktop={isDesktop} onOpen={openRecipe} onSeeAll={() => navigate('/feed')} />
    </>
  )

  // ── Masthead pieces, shared by both breakpoints ──────────────────────────
  const searchField = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isDesktop ? 10 : 9,
        flex: 1,
        minWidth: 0,
        background: isDesktop ? 'var(--surface)' : 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 13,
        padding: isDesktop ? '11px 15px' : '10px 14px',
      }}
    >
      <span aria-hidden style={{ color: 'var(--muted)', fontSize: isDesktop ? 16 : 15 }}>
        ⌕
      </span>
      <input
        value={search}
        onChange={(e) => changeSearch(e.target.value)}
        placeholder="Search recipes, ingredients…"
        aria-label="Search recipes"
        style={{
          flex: 1,
          minWidth: 0,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'var(--text)',
          fontFamily: 'inherit',
          fontSize: isDesktop ? 14 : 13.5,
        }}
      />
    </div>
  )

  const filtersButton = (
    <button
      onClick={() => setSheetOpen(true)}
      aria-haspopup="dialog"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        flexShrink: 0,
        background: isDesktop ? 'var(--surface)' : 'var(--surface2)',
        border: '1px solid var(--border)',
        color: 'var(--accent)',
        fontWeight: 700,
        fontSize: 13.5,
        fontFamily: 'inherit',
        borderRadius: isDesktop ? 11 : 13,
        padding: isDesktop ? '11px 17px' : '10px 15px',
        cursor: 'pointer',
      }}
    >
      {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
    </button>
  )

  const today = new Date()

  return (
    <>
      <div className="scroll" style={pageStyle}>
        {isDesktop ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ ...eyebrow, flexShrink: 0 }}>DISCOVER · {longDate(today)}</div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, width: 420, maxWidth: '100%' }}>
              {searchField}
              {filtersButton}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
            <div style={eyebrow}>DISCOVER</div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{shortDate(today)}</div>
          </div>
        )}

        {isEditorial && hero && (
          <>
            <DiscoverHero recipe={hero} isDesktop={isDesktop} onOpen={() => openRecipe(hero.id)} />
            <ScanBand isDesktop={isDesktop} />
          </>
        )}

        {/* Mobile keeps search under the fold — the cover story is what the
            page leads with, and a search field above it would say otherwise. */}
        {!isDesktop && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            {searchField}
            {filtersButton}
          </div>
        )}

        {/* The department's masthead. No result count: the list is paginated,
            so any number here would be "how many are loaded", not how many
            there are. */}
        {department && (
          <div style={{ marginBottom: 16 }}>
            <button type="button" onClick={() => setDepartment(null)} style={backToFrontPage}>
              ‹ Back to Discover
            </button>
            <div style={{ borderTop: '1px solid var(--text)', paddingTop: 8 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: isDesktop ? 24 : 22,
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--text)',
                }}
              >
                {department.title}
              </h1>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>{department.subtitle}</div>
            </div>
          </div>
        )}

        {/* No cover story means there is nothing to make a front page out of —
            loading, an error, or a genuinely empty catalogue. The result list
            already says each of those properly, so it stands in. */}
        {!isEditorial || !hero ? (
          results
        ) : isDesktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 28 }}>{departments}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{departments}</div>
        )}
      </div>

      {/* Outside the scroll container on purpose: the Modal backdrop is
          position:absolute, and inside a scrolled box it would ride the
          content instead of covering the frame. */}
      {sheetOpen && (
        <FiltersSheet
          cuisine={cuisine}
          difficulty={difficulty}
          tags={tags}
          tagRanking={tagRanking}
          onApply={applyFilters}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  )
}

// ── § C③ "From your people" ─────────────────────────────────────────────────

/**
 * The followed-authors department.
 *
 * Split into its own component so `useFeed` only mounts — and only fetches — on
 * the front page: the flat result list has no use for it, and a filter query
 * should not drag a social request along with it.
 *
 * Reuses the existing GET /feed?scope=following the Feed tab's second tab
 * already drives (same query key, so the two share a cache) rather than asking
 * the backend for a Discover-shaped endpoint.
 */
function FromYourPeople({
  isDesktop,
  onOpen,
  onSeeAll,
}: {
  isDesktop: boolean
  onOpen: (recipeId: string) => void
  onSeeAll: () => void
}) {
  const { data } = useFeed('following')
  const items = data?.pages[0]?.items ?? []

  const editorial: EditorialItem[] = items.slice(0, SECTION_SIZE).map((item) => ({
    recipe: item.recipe,
    // Who cooked it and when — the reason this section exists at all. It
    // replaces the time/difficulty meta rather than joining it.
    meta: (
      <>
        <Avatar username={item.author.username} profileImageUrl={item.author.profileImageUrl} seed={item.author.id} size={18} />
        {item.author.username} · {formatRelativeTime(item.recipe.createdAt)}
      </>
    ),
  }))

  return (
    <EditorialSection
      index={3}
      title="From your people"
      isDesktop={isDesktop}
      items={editorial}
      onOpen={onOpen}
      onSeeAll={editorial.length > 0 ? onSeeAll : undefined}
    />
  )
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** "Thu 7 Aug" — the mobile eyebrow's right-hand side. */
function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "THURSDAY 7 AUGUST" — the desktop masthead runs it into the DISCOVER label. */
function longDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

// ── Inline styles ───────────────────────────────────────────────────────────

const eyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.13em',
  color: 'var(--muted)',
}

const backToFrontPage: CSSProperties = {
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  padding: '0 0 12px',
}

const loadMoreBtn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}
