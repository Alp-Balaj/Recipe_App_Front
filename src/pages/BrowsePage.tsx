import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import RecipeCard from '@/components/RecipeCard'
import StateBlock from '@/components/ui/StateBlock'
import { useRecipeList, type BrowseFilters } from '@/hooks/useRecipeList'
import type { Difficulty, RecipeResponse } from '@/api/types'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

const PAGE_STYLE = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 16px',
} as const

export default function BrowsePage() {
  const navigate = useNavigate()

  // Committed filter state — each change produces a new query key, which resets
  // useInfiniteQuery pagination back to the first page automatically.
  const [cuisine, setCuisine] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(undefined)
  const [tags, setTags] = useState<string[]>([])

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

  const hasActiveFilters = !!cuisine || !!difficulty || tags.length > 0
  const clearFilters = () => {
    setCuisine('')
    setDifficulty(undefined)
    setTags([])
  }

  return (
    <div className="scroll" style={PAGE_STYLE}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>Browse recipes</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
          Public recipes from the community and your own.
        </div>
      </div>

      {/* Filters */}
      <Filters
        cuisine={cuisine}
        difficulty={difficulty}
        tags={tags}
        onCuisine={setCuisine}
        onDifficulty={setDifficulty}
        onAddTag={(t) => setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))}
        onRemoveTag={(t) => setTags((prev) => prev.filter((x) => x !== t))}
      />

      {hasActiveFilters && (
        <button onClick={clearFilters} style={clearBtn}>
          Clear filters
        </button>
      )}

      {/* Body states */}
      {isLoading ? (
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
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} variant="browse" onOpen={() => navigate(`/recipes/${r.id}`)} />
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 12px' }}>
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
      )}
    </div>
  )
}

// ── Filters ─────────────────────────────────────────────────────────────────

function Filters({
  cuisine,
  difficulty,
  tags,
  onCuisine,
  onDifficulty,
  onAddTag,
  onRemoveTag,
}: {
  cuisine: string
  difficulty: Difficulty | undefined
  tags: string[]
  onCuisine: (v: string) => void
  onDifficulty: (v: Difficulty | undefined) => void
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      {/* Difficulty chips */}
      <div className="scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -18px', padding: '0 18px 2px' }}>
        <Chip active={!difficulty} onClick={() => onDifficulty(undefined)}>
          All levels
        </Chip>
        {DIFFICULTIES.map((d) => (
          <Chip key={d} active={difficulty === d} onClick={() => onDifficulty(difficulty === d ? undefined : d)}>
            {d}
          </Chip>
        ))}
      </div>

      {/* Cuisine + tag inputs */}
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

      {/* Active tag chips (match-ALL) */}
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 600,
        padding: '7px 15px',
        borderRadius: 999,
        border: 'none',
        background: active ? 'var(--accent)' : 'var(--surface2)',
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

const inputStyle = {
  flex: 1,
  minWidth: 140,
  fontSize: 13.5,
  fontFamily: 'inherit',
  padding: '9px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--inputbg)',
  color: 'var(--text)',
  outline: 'none',
} as const

const tagChip = {
  fontSize: 12.5,
  fontWeight: 600,
  padding: '5px 11px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  cursor: 'pointer',
  fontFamily: 'inherit',
} as const

const clearBtn = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '0 0 12px',
  fontFamily: 'inherit',
} as const

const loadMoreBtn = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 13,
  padding: '10px 18px',
  fontFamily: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
} as const
