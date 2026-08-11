// ─────────────────────────────────────────────────────────────────────────
// The recipe picker's guts (meal-plan redesign, picker PR) — container-free,
// so the same thing can be docked beside the day page or dropped into a sheet.
//
// Built for the person who has ALREADY decided. The search field is the
// primary control, focused on open, filtering the prefetched personal corpus
// in memory (see usePickerCorpus for why in memory and not on the server).
// Everything below it is what you see while you haven't typed yet, which is
// why it leads with what you've cooked before rather than everyone's newest.
//
// Nothing is ever hidden, only marked: a dish already planned this week keeps
// its place in the list wearing a chip. Silently filtering results is how a
// picker earns "it doesn't have my recipe".
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { queryKeys } from '@/api/queryKeys'
import { useAuth } from '@/auth/AuthContext'
import { useInfiniteRecipes } from '@/hooks/useInfiniteRecipes'
import {
  matchesQuery,
  plannedAgo,
  shoppingConsequence,
  usePickerCorpus,
  type PickerRecipe,
  type PickerSegment,
} from '@/hooks/usePickerCorpus'
import { resolveImageUrl } from '@/lib/images'
import { formatMinutes, gradientFor } from '@/pages/recipeVisuals'
import StateBlock from '@/components/ui/StateBlock'

const BROWSE_PAGE = 20

interface Props {
  /** The question this picker answers, e.g. "What's for Wednesday dinner?". */
  question: string
  subtitle?: string
  /**
   * The chosen recipe. The second argument is ADDITIVE (KAN-6) and every caller
   * before it ignores it: the planner places by id and re-reads the plan, but
   * "Add a cook" has to NAME the dish in its next step, and the row the user
   * just tapped already carries the title — asking the server for it again
   * would be a round trip to learn something that was on screen.
   */
  onPick: (recipeId: string, recipe: PickerRecipe) => void
  onClose?: () => void
  /**
   * recipeId → where it already sits this week ("Tue", "Tue, Thu"). A warning,
   * never a block: planning the same dish twice is a real thing people do.
   */
  plannedDays?: Map<string, string>
  /**
   * Normalised ingredient names the day already needs. Supplied, each row says
   * what it would add to the shopping — the payoff of the picker sitting next
   * to the day's ingredient list.
   */
  alreadyNeeded?: ReadonlySet<string>
  /** Where fill mode goes after this placement, e.g. "then: Thu →". */
  nextHint?: string
  /**
   * Label and placeholder for the search field. ADDITIVE (KAN-6), defaulting to
   * what every planner caller already showed. "Add a cook" overrides it because
   * the corpus it cares about is All — telling that user they are searching
   * "your recipes" would describe the one lens their dish is least likely to be
   * in, and the picker not being saved-only is the point of it being here.
   */
  searchLabel?: string
  /**
   * Which lens to open on, overriding the corpus-led default below. ADDITIVE
   * (KAN-6): the planner's default leads with what you have cooked or planned
   * before, which is right when you are choosing what to eat next. "Add a cook"
   * wants the opposite — the dish it exists to capture is the one your personal
   * lenses do NOT have, so opening on a personal segment would hide it behind a
   * tab the user has to notice.
   */
  defaultSegment?: PickerSegment
  /** 'panel' fills its docked column; 'sheet' sits inside a Modal. */
  variant?: 'panel' | 'sheet'
}

const SEGMENT_LABELS: Record<PickerSegment, string> = {
  again: 'Again',
  saved: 'Saved',
  mine: 'Mine',
  all: 'All',
}

export default function PickerContent({
  question,
  subtitle,
  onPick,
  onClose,
  plannedDays,
  alreadyNeeded,
  nextHint,
  searchLabel = 'Search your recipes',
  defaultSegment,
  variant = 'sheet',
}: Props) {
  const { user } = useAuth()
  const corpus = usePickerCorpus(user?.userId, true)
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<PickerSegment | null>(null)
  const [cursor, setCursor] = useState(0)

  // Everyone's recipes share Discover's query key, so opening the picker
  // usually paints this from cache rather than fetching.
  const browse = useInfiniteRecipes({ queryKey: queryKeys.recipes.list(), pageSize: BROWSE_PAGE })

  // The default segment follows the corpus rather than an effect: lead with
  // what you've cooked, fall through to All for someone with no history yet.
  const segment: PickerSegment =
    chosen ??
    defaultSegment ??
    (corpus.counts.again > 0
      ? 'again'
      : corpus.counts.saved > 0
        ? 'saved'
        : corpus.counts.mine > 0
          ? 'mine'
          : 'all')

  const browseRecipes: PickerRecipe[] = useMemo(
    () =>
      (browse.data?.pages ?? [])
        .flatMap((page) => page.items)
        .map((recipe) => ({
          id: recipe.id,
          title: recipe.title,
          imageUrl: recipe.imageUrl,
          totalTimeMinutes: recipe.totalTimeMinutes,
          servings: recipe.servings,
          isSaved: false,
          isMine: false,
        })),
    [browse.data],
  )

  const results = useMemo(() => {
    const source = segment === 'all' ? browseRecipes : corpus.forSegment(segment)
    // Personal segments carry richer facts (saved / planned), so when a recipe
    // is in both, prefer the corpus copy.
    const enriched =
      segment === 'all'
        ? source.map((recipe) => corpus.byId.get(recipe.id) ?? recipe)
        : source
    return enriched.filter((recipe) => matchesQuery(recipe, query))
  }, [segment, browseRecipes, corpus, query])

  const activeIndex = Math.min(cursor, Math.max(results.length - 1, 0))
  const loading = segment === 'all' ? browse.isLoading : corpus.isLoading

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((c) => Math.min(c + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault()
      onPick(results[activeIndex].id, results[activeIndex])
    }
  }

  const setSegment = (next: PickerSegment) => {
    setChosen(next)
    setCursor(0)
  }

  return (
    <div style={variant === 'panel' ? panelShell : sheetShell}>
      <div style={headerRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={questionStyle}>{question}</h2>
          {subtitle && <div style={subtitleStyle}>{subtitle}</div>}
        </div>
        {onClose && (
          <button type="button" style={closeButton} onClick={onClose}>
            {variant === 'panel' ? 'Close' : 'Cancel'}
          </button>
        )}
      </div>

      <input
        type="search"
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the search field IS
        // the picker's primary control; opening it and typing is the fast path.
        autoFocus
        value={query}
        aria-label={searchLabel}
        placeholder={searchLabel}
        style={searchInput}
        onChange={(e) => {
          setQuery(e.target.value)
          setCursor(0)
        }}
        onKeyDown={onSearchKeyDown}
      />

      <div style={segmentRow} role="tablist" aria-label="Where to look">
        {(['again', 'saved', 'mine', 'all'] as PickerSegment[]).map((option) => {
          const count = option === 'all' ? null : corpus.counts[option]
          // An empty personal lens is noise — don't offer a dead tab.
          if (count === 0 && option !== segment) return null
          const active = option === segment
          return (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={active}
              style={{ ...segmentChip, ...(active ? segmentChipActive : {}) }}
              onClick={() => setSegment(option)}
            >
              {SEGMENT_LABELS[option]}
              {count !== null && count > 0 && <span style={segmentCount}>{count}</span>}
            </button>
          )
        })}
      </div>

      <div style={listStyle}>
        {loading && <StateBlock title="Loading your recipes…" />}

        {!loading && results.length === 0 && (
          <StateBlock
            title={query ? `No match for "${query.trim()}"` : emptyTitle(segment)}
            body={
              query
                ? 'Try a different word, look in All, or add it as a new recipe.'
                : emptyBody(segment)
            }
            action={
              segment !== 'all'
                ? { label: 'Look in all recipes', onClick: () => setSegment('all') }
                : undefined
            }
          />
        )}

        {!loading &&
          results.map((recipe, index) => (
            <PickerRow
              key={recipe.id}
              recipe={recipe}
              active={index === activeIndex}
              plannedOn={plannedDays?.get(recipe.id)}
              alreadyNeeded={alreadyNeeded}
              onPick={() => onPick(recipe.id, recipe)}
            />
          ))}

        {!loading && segment === 'all' && browse.hasNextPage && (
          <button
            type="button"
            style={moreButton}
            disabled={browse.isFetchingNextPage}
            onClick={() => browse.fetchNextPage()}
          >
            {browse.isFetchingNextPage ? 'Loading…' : 'Show more'}
          </button>
        )}

        {!loading && results.length === 0 && (
          <Link to="/recipes/new" style={createLink}>
            Add a new recipe
          </Link>
        )}
      </div>

      {nextHint && <div style={footerHint}>{nextHint}</div>}
    </div>
  )
}

function emptyTitle(segment: PickerSegment): string {
  if (segment === 'again') return 'Nothing planned before'
  if (segment === 'saved') return 'Nothing saved yet'
  if (segment === 'mine') return "You haven't written any recipes yet"
  return 'No recipes yet'
}

function emptyBody(segment: PickerSegment): string {
  if (segment === 'again') return 'Once you plan a few meals, they show up here first.'
  if (segment === 'saved') return 'Save a recipe while browsing and it lands here.'
  return 'Write one and it will be ready to plan.'
}

function PickerRow({
  recipe,
  active,
  plannedOn,
  alreadyNeeded,
  onPick,
}: {
  recipe: PickerRecipe
  active: boolean
  plannedOn?: string
  alreadyNeeded?: ReadonlySet<string>
  onPick: () => void
}) {
  // Time first — the planning question is "can I actually cook this that
  // evening". Provenance replaces cuisine because it explains the ranking.
  const provenance = recipe.lastPlannedWeek
    ? plannedAgo(recipe.lastPlannedWeek)
    : recipe.isSaved
      ? 'saved'
      : recipe.isMine
        ? 'yours'
        : ''
  // With a day's ingredients to compare against, shopping consequence is the
  // more useful second fact — and the segment chip already says where the
  // recipe came from, so provenance isn't lost, just not repeated per row.
  const consequence = alreadyNeeded ? shoppingConsequence(recipe, alreadyNeeded) : null
  const meta = [
    recipe.totalTimeMinutes ? formatMinutes(recipe.totalTimeMinutes) : '',
    consequence ?? provenance,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <button
      type="button"
      style={{ ...rowStyle, ...(active ? rowActive : {}) }}
      aria-label={recipe.title}
      onClick={onPick}
    >
      <span
        style={{
          ...thumb,
          ...(recipe.imageUrl
            ? {
                backgroundImage: `url(${resolveImageUrl(recipe.imageUrl)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: gradientFor(recipe.id || recipe.title) }),
        }}
      />
      <span style={rowText}>
        <span style={rowTitle}>{recipe.title}</span>
        {meta && <span style={rowMeta}>{meta}</span>}
      </span>
      {plannedOn && <span style={plannedChip}>Planned {plannedOn}</span>}
    </button>
  )
}

const panelShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: 14,
  position: 'sticky',
  top: 0,
  maxHeight: 'calc(100vh - 140px)',
  overflowY: 'auto',
}

const sheetShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minHeight: 0,
}

const headerRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
}

const questionStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  margin: 0,
  lineHeight: 1.2,
}

const subtitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginTop: 4,
}

const closeButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '6px 12px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
}

const searchInput: CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  fontFamily: 'inherit',
  fontSize: 14,
  background: 'var(--inputbg)',
  color: 'var(--text)',
}

const segmentRow: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
}

const segmentChip: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 999,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: '0.04em',
  background: 'transparent',
  color: 'var(--muted)',
}

const segmentChipActive: CSSProperties = {
  background: 'var(--accent-fill)',
  borderColor: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
}

const segmentCount: CSSProperties = {
  marginLeft: 5,
  opacity: 0.7,
  fontVariantNumeric: 'tabular-nums',
}

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  width: '100%',
  minWidth: 0,
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: 'inherit',
  border: '1px solid transparent',
  borderRadius: 14,
  padding: 8,
  background: 'transparent',
  color: 'var(--text)',
}

const rowActive: CSSProperties = {
  background: 'var(--chipbg)',
  borderColor: 'var(--accent-fill)',
}

const thumb: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 12,
  flexShrink: 0,
}

const rowText: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

// Two lines, not an ellipsis: "Slow-roast tomato and…" and "Slow-roast tomato
// with…" are indistinguishable truncated, and that is a real failure.
const rowTitle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.25,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const rowMeta: CSSProperties = {
  fontSize: 11.5,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const plannedChip: CSSProperties = {
  flexShrink: 0,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  borderRadius: 6,
  padding: '3px 6px',
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
}

const moreButton: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--surface2)',
  color: 'var(--text)',
  marginTop: 4,
}

const footerHint: CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: 9,
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--accent)',
  letterSpacing: '0.03em',
}

const createLink: CSSProperties = {
  alignSelf: 'center',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
  padding: '6px 0',
}
