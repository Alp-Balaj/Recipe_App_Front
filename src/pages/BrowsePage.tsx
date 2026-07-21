import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import SocialRecipeCard from '@/components/SocialRecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import { useOpenRecipe } from '@/components/recipeCanvas'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useRecipeList, type BrowseFilters } from '@/hooks/useRecipeList'
import type { Difficulty, RecipeResponse } from '@/api/types'
import { formatMinutes, gradientFor } from './recipeVisuals'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

export default function BrowsePage() {
  // BrowsePage also renders as the canvas BACKDROP, where `useLocation()` is a
  // /recipes/:id URL — useOpenRecipe carries the real backdrop through.
  const openRecipe = useOpenRecipe()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Committed filter state — each change produces a new query key, which resets
  // useInfiniteQuery pagination back to the first page automatically.
  const [cuisine, setCuisine] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(undefined)
  const [tags, setTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  const filters: BrowseFilters = useMemo(
    () => ({ cuisine, difficulty, tags }),
    [cuisine, difficulty, tags],
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

  // Client-side title/description search — purely presentational, layered on
  // top of the server-filtered list (no extra request).
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return recipes
    return recipes.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    )
  }, [recipes, search])

  const hasActiveFilters = !!cuisine || !!difficulty || tags.length > 0
  const clearFilters = () => {
    setCuisine('')
    setDifficulty(undefined)
    setTags([])
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
        hasActiveFilters
          ? 'No recipes match these filters yet. Try loosening them.'
          : 'Nothing here yet — be the first to add a recipe.'
      }
      action={hasActiveFilters ? { label: 'Clear filters', onClick: clearFilters } : undefined}
    />
  ) : (
    <>
      {isDesktop ? (
        <DesktopResults recipes={visible} onOpen={openRecipe} />
      ) : (
        visible.map((r) => (
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

  return (
    <div className="scroll" style={pageStyle}>
      {/* Header — title + subtitle, with search + Filters toggle. */}
      <div
        style={{
          display: 'flex',
          alignItems: isDesktop ? 'center' : 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div style={{ flex: 1, minWidth: isDesktop ? 200 : '100%' }}>
          <div style={{ fontSize: isDesktop ? 26 : 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Explore recipes
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 3 }}>
            Public recipes from the community and your own.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: isDesktop ? '0 0 auto' : '1 1 100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              flex: 1,
              minWidth: 0,
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 13,
              padding: '10px 14px',
              width: isDesktop ? 280 : undefined,
            }}
          >
            <span aria-hidden style={{ color: 'var(--muted)', fontSize: 15 }}>⌕</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
                fontSize: 13.5,
              }}
            />
          </div>
          <button
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              flexShrink: 0,
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: 13.5,
              fontFamily: 'inherit',
              borderRadius: 13,
              padding: '10px 15px',
              cursor: 'pointer',
            }}
          >
            <span aria-hidden>⚙</span> Filters
          </button>
        </div>
      </div>

      {/* Difficulty pills — the primary quick filter (design pill row). */}
      <div
        className="scroll"
        style={{
          display: 'flex',
          gap: 9,
          overflowX: 'auto',
          margin: isDesktop ? '0 0 8px' : '0 -18px 8px',
          padding: isDesktop ? '0 0 2px' : '0 18px 2px',
          flexWrap: isDesktop ? 'wrap' : 'nowrap',
        }}
      >
        <Pill active={!difficulty} onClick={() => setDifficulty(undefined)}>
          All levels
        </Pill>
        {DIFFICULTIES.map((d) => (
          <Pill key={d} active={difficulty === d} onClick={() => setDifficulty(difficulty === d ? undefined : d)}>
            {d}
          </Pill>
        ))}
      </div>

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 14px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>Trending now</div>
        </div>
      )}

      {body}
    </div>
  )
}

// ── Desktop results: card grid + a Chef's-pick rail ──────────────────────────

function DesktopResults({ recipes, onOpen }: { recipes: RecipeResponse[]; onOpen: (id: string) => void }) {
  const pick = recipes[0]
  const grid = recipes.length > 1 ? recipes.slice(1) : recipes

  return (
    <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 18,
          }}
        >
          {grid.map((r) => (
            <SocialRecipeCard key={r.id} recipe={r} onOpen={() => onOpen(r.id)} />
          ))}
        </div>
      </div>

      {pick && (
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Chef's pick</div>
          <ChefPick recipe={pick} onOpen={() => onOpen(pick.id)} />
        </div>
      )}
    </div>
  )
}

function ChefPick({ recipe, onOpen }: { recipe: RecipeResponse; onOpen: () => void }) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={recipe.title}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{
        position: 'relative',
        height: 320,
        borderRadius: 22,
        overflow: 'hidden',
        cursor: 'pointer',
        background: gradientFor(recipe.id || recipe.title),
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: 'rgba(0,0,0,.45)',
          backdropFilter: 'blur(6px)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 700,
          padding: '5px 11px',
          borderRadius: 999,
        }}
      >
        ◷ {formatMinutes(recipe.totalTimeMinutes)} · {recipe.difficulty}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '48px 18px 18px',
          background: 'linear-gradient(to top, rgba(10,7,4,.94), transparent)',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{recipe.title}</div>
        <div
          style={{
            fontSize: 13,
            color: 'rgba(255,255,255,.75)',
            marginTop: 4,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {recipe.description}
        </div>
        <span
          style={{
            marginTop: 13,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--accent)',
            color: '#1a1207',
            fontSize: 13,
            fontWeight: 800,
            padding: '9px 16px',
            borderRadius: 999,
          }}
        >
          View recipe ›
        </span>
      </div>
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

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 600,
        padding: '8px 16px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'var(--accent)' : 'var(--inputbg)',
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
