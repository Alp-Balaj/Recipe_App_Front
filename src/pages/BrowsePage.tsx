import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import SocialRecipeCard from '@/components/SocialRecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useRecipeList, type BrowseFilters } from '@/hooks/useRecipeList'
import type { Difficulty, RecipeResponse } from '@/api/types'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

/**
 * How long typing has to settle before the search term reaches the wire.
 * Matches IngredientNameField's debounce, the app's other type-ahead.
 */
const SEARCH_DEBOUNCE_MS = 300

export default function BrowsePage() {
  // BrowsePage also renders as the canvas BACKDROP, where `useLocation()` is a
  // /recipes/:id URL — useOpenRecipe carries the real backdrop through.
  const openRecipe = useOpenRecipe()
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Committed filter state — each change produces a new query key, which resets
  // useInfiniteQuery pagination back to the first page automatically.
  const [cuisine, setCuisine] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(undefined)
  const [tags, setTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(true)

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
    () => ({ cuisine, difficulty, tags, search: debouncedSearch }),
    [cuisine, difficulty, tags, debouncedSearch],
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

  const hasActiveFilters = !!cuisine || !!difficulty || tags.length > 0 || !!search.trim()
  const clearFilters = () => {
    setCuisine('')
    setDifficulty(undefined)
    setTags([])
    setSearch('')
  }

  const addTag = (t: string) => setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t))

  const pageStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    bottom: 'var(--nav-h, 74px)',
    overflowY: 'auto',
    padding: isDesktop ? '28px 34px 40px' : '26px 18px 16px',
  }

  // ── Body: states, then the recipe surface (grid on desktop, list on mobile) ──
  const body = isLoading ? (
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
            : 'Nothing here yet — be the first to add a recipe.'
      }
      action={hasActiveFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined}
    />
  ) : (
    <>
      {isDesktop ? (
        // Design 4a: a plain auto-fill card grid. minmax(260px) lands on three
        // columns at the design's content width and degrades to two/one when
        // the recipe canvas pane is open.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {recipes.map((r) => (
            <SocialRecipeCard key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />
          ))}
        </div>
      ) : (
        recipes.map((r) => (
          <SocialRecipeCard key={r.id} recipe={r} onOpen={() => openRecipe(r.id)} />
        ))
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

  // Search field + Filters toggle + difficulty pills, shared by both layouts —
  // the design sizes them differently per breakpoint but the wiring is one set.
  const searchField = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: isDesktop ? 10 : 9,
        flex: 1,
        minWidth: isDesktop ? 280 : 0,
        background: isDesktop ? 'var(--surface)' : 'var(--surface2)',
        border: '1px solid var(--border)',
        borderRadius: 13,
        padding: isDesktop ? '12px 16px' : '10px 14px',
      }}
    >
      <span aria-hidden style={{ color: 'var(--muted)', fontSize: isDesktop ? 16 : 15 }}>⌕</span>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={isDesktop ? 'Search recipes, ingredients, cuisines…' : 'Search recipes, ingredients…'}
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

  const filtersToggle = (
    <button
      onClick={() => setShowFilters((s) => !s)}
      aria-expanded={showFilters}
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
      <span aria-hidden>⚙</span> Filters
    </button>
  )

  const difficultyPills = (
    <>
      <Pill active={!difficulty} desktop={isDesktop} onClick={() => setDifficulty(undefined)}>
        All levels
      </Pill>
      {DIFFICULTIES.map((d) => (
        <Pill
          key={d}
          active={difficulty === d}
          desktop={isDesktop}
          onClick={() => setDifficulty(difficulty === d ? undefined : d)}
        >
          {d}
        </Pill>
      ))}
    </>
  )

  return (
    <div className="scroll" style={pageStyle}>
      {isDesktop ? (
        <>
          {/* Design 4a: title block on the left, the New-recipe CTA opposite. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 20,
              flexWrap: 'wrap',
              marginBottom: 22,
            }}
          >
            <div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
                Explore recipes
              </div>
              <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
                Public recipes from the community and your own.
              </div>
            </div>
            <button onClick={() => navigate('/recipes/new')} style={newRecipeBtn}>
              <span aria-hidden>＋</span> New recipe
            </button>
          </div>

          {/* One row: search, then the difficulty pills inline beside it. */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            {searchField}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {difficultyPills}
              {filtersToggle}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Design 3a: stacked header, then search + Filters, then a
              full-bleed scrollable pill row. */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: '100%' }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
                Explore recipes
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 3 }}>
                Public recipes from the community and your own.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '1 1 100%' }}>
              {searchField}
              {filtersToggle}
            </div>
          </div>

          <div
            className="scroll"
            style={{ display: 'flex', gap: 9, overflowX: 'auto', margin: '0 -18px 8px', padding: '0 18px 2px' }}
          >
            {difficultyPills}
          </div>
        </>
      )}

      {/* Advanced filters — cuisine + tag inputs (toggle via the Filters button). */}
      {showFilters && (
        <AdvancedFilters
          cuisine={cuisine}
          tags={tags}
          onCuisine={setCuisine}
          onAddTag={addTag}
          onRemoveTag={removeTag}
        />
      )}

      {hasActiveFilters && (
        <button onClick={clearFilters} style={clearBtn}>
          Clear filters
        </button>
      )}

      {/* Section heading (matches the design's "Trending now"). */}
      {!isLoading && !isError && recipes.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: isDesktop ? '0 0 16px' : '14px 0 14px' }}>
          <div style={{ fontSize: isDesktop ? 19 : 17, fontWeight: 800, color: 'var(--text)' }}>Trending now</div>
        </div>
      )}

      {body}
    </div>
  )
}

// ── Advanced filters (cuisine + tags) ────────────────────────────────────────

function AdvancedFilters({
  cuisine,
  tags,
  onCuisine,
  onAddTag,
  onRemoveTag,
}: {
  cuisine: string
  tags: string[]
  onCuisine: (v: string) => void
  onAddTag: (t: string) => void
  onRemoveTag: (t: string) => void
}) {
  const [cuisineDraft, setCuisineDraft] = useState(cuisine)
  const [tagDraft, setTagDraft] = useState('')

  const commitCuisine = () => {
    const v = cuisineDraft.trim()
    if (v !== cuisine) onCuisine(v)
  }
  const commitTag = () => {
    const v = tagDraft.trim().toLowerCase()
    if (v) onAddTag(v)
    setTagDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={cuisineDraft}
          onChange={(e) => setCuisineDraft(e.target.value)}
          onBlur={commitCuisine}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitCuisine()
            }
          }}
          placeholder="Cuisine (e.g. italian)"
          aria-label="Filter by cuisine"
          style={inputStyle}
        />
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitTag()
            }
          }}
          placeholder="Add a tag + Enter"
          aria-label="Filter by tag"
          style={inputStyle}
        />
      </div>

      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {tags.map((t) => (
            <button key={t} onClick={() => onRemoveTag(t)} style={tagChip} aria-label={`Remove tag ${t}`}>
              {t} ✕
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Difficulty filter pill. The design draws it as a rounded capsule on mobile
 *  and a squarer, roomier button in the desktop filter row. */
function Pill({
  active,
  desktop,
  onClick,
  children,
}: {
  active: boolean
  desktop?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        fontSize: desktop ? 13.5 : 13,
        fontWeight: 600,
        padding: desktop ? '11px 17px' : '8px 16px',
        borderRadius: desktop ? 11 : 999,
        border: `1px solid ${active ? 'var(--accent-fill)' : 'var(--border)'}`,
        background: active ? 'var(--accent-fill)' : 'var(--inputbg)',
        color: active ? 'var(--accent-ink)' : 'var(--muted)',
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

// ── Inline styles ───────────────────────────────────────────────────────────

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 140,
  fontSize: 13.5,
  fontFamily: 'inherit',
  padding: '10px 13px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  outline: 'none',
}

const tagChip: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  padding: '5px 11px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const clearBtn: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '8px 0 0',
  fontFamily: 'inherit',
}

const newRecipeBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 13,
  padding: '12px 20px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 800,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
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
