// ─────────────────────────────────────────────────────────────────────────
// The Discover filter sheet (Discover redesign, §B).
//
// Replaces the always-open inline panel — difficulty pills, a cuisine select
// and all 39 tag chips stacked above the results — with a sheet the user opens
// deliberately. That panel cost every visitor a screenful of controls to reach
// the recipes; the count on the trigger ("Filters (3)") is what it is replaced
// by, and it is the ONLY filter state shown outside the sheet.
//
// Bottom sheet on a phone, centered dialog on desktop — both through the shared
// Modal primitive, so focus trapping, Escape and focus restore come for free.
//
// Choices inside are a DRAFT: nothing reaches the query until Apply. The old
// panel committed on every tap, which meant four taps to set up a filter combo
// fired four list requests and three throwaway renders.
// ─────────────────────────────────────────────────────────────────────────

import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Cuisine, Difficulty, RecipeTag } from '@/api/types'
import { CUISINES, label } from '@/api/vocabulary'
import Modal from '@/components/ui/Modal'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** How many tag chips the sheet shows before "+ N more". */
export const VISIBLE_TAGS = 8

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

export interface FilterSelection {
  cuisine: Cuisine | ''
  difficulty: Difficulty | undefined
  tags: RecipeTag[]
}

interface FiltersSheetProps extends FilterSelection {
  /**
   * The whole tag vocabulary, most-relevant first. The caller ranks it (see
   * BrowsePage) — this component only decides where to cut it.
   */
  tagRanking: readonly RecipeTag[]
  onApply: (next: FilterSelection) => void
  onClose: () => void
}

export default function FiltersSheet({
  cuisine,
  difficulty,
  tags,
  tagRanking,
  onApply,
  onClose,
}: FiltersSheetProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // Seeded once — the sheet only ever mounts open, so there is no stale-prop
  // window to re-sync from.
  const [draftCuisine, setDraftCuisine] = useState<Cuisine | ''>(cuisine)
  const [draftDifficulty, setDraftDifficulty] = useState<Difficulty | undefined>(difficulty)
  const [draftTags, setDraftTags] = useState<RecipeTag[]>(tags)
  const [expanded, setExpanded] = useState(false)

  // A selected tag is never hidden behind "+ N more": you must be able to see
  // — and undo — every filter you have on, without hunting for it.
  const visible = expanded
    ? tagRanking
    : Array.from(new Set([...draftTags, ...tagRanking.slice(0, VISIBLE_TAGS)]))
  const hiddenCount = tagRanking.length - visible.length

  const toggleTag = (t: RecipeTag) =>
    setDraftTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  const clearAll = () => {
    setDraftCuisine('')
    setDraftDifficulty(undefined)
    setDraftTags([])
  }

  const apply = () => {
    onApply({ cuisine: draftCuisine, difficulty: draftDifficulty, tags: draftTags })
    onClose()
  }

  return (
    <Modal onClose={onClose} label="Filters" variant={isDesktop ? 'center' : 'bottom'}>
      <div
        style={
          isDesktop
            ? {
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--cardsh)',
                borderRadius: 20,
                padding: '18px 20px 20px',
              }
            : undefined
        }
      >
        {/* Drag handle — the phone sheet's "this pulls down" affordance. */}
        {!isDesktop && (
          <div
            aria-hidden
            style={{
              width: 38,
              height: 4,
              borderRadius: 999,
              background: 'var(--border)',
              margin: '0 auto 14px',
            }}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 22,
              fontWeight: 600,
              margin: 0,
              color: 'var(--text)',
            }}
          >
            Filters
          </h2>
          <button type="button" onClick={clearAll} style={clearAllLink}>
            Clear all
          </button>
        </div>

        <FieldLabel>DIFFICULTY</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          <FilterPill active={!draftDifficulty} onClick={() => setDraftDifficulty(undefined)}>
            All levels
          </FilterPill>
          {DIFFICULTIES.map((d) => (
            <FilterPill
              key={d}
              active={draftDifficulty === d}
              onClick={() => setDraftDifficulty(draftDifficulty === d ? undefined : d)}
            >
              {d}
            </FilterPill>
          ))}
        </div>

        <FieldLabel>CUISINE</FieldLabel>
        {/* The real <select> rides invisibly on top of the styled row, so the
            row looks like the rest of the sheet while the picker that opens is
            still the platform's own. */}
        <div style={{ position: 'relative', marginBottom: 18 }}>
          <div style={cuisineRow}>
            <span style={{ color: draftCuisine ? 'var(--text)' : 'var(--muted)' }}>
              {draftCuisine ? label(draftCuisine) : 'Any cuisine'}
            </span>
            <span aria-hidden style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              ▾
            </span>
          </div>
          <select
            value={draftCuisine}
            onChange={(e) => setDraftCuisine(e.target.value as Cuisine | '')}
            aria-label="Filter by cuisine"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <option value="">Any cuisine</option>
            {CUISINES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </div>

        <FieldLabel>TAGS</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 20 }}>
          {visible.map((t) => {
            const active = draftTags.includes(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                aria-pressed={active}
                aria-label={active ? `Remove tag ${label(t)}` : `Filter by tag ${label(t)}`}
                style={
                  active
                    ? { ...tagChip, background: 'var(--accent)', color: 'var(--accent-ink)' }
                    : tagChip
                }
              >
                {label(t)}
              </button>
            )
          })}
          {hiddenCount > 0 && (
            <button type="button" onClick={() => setExpanded(true)} style={{ ...tagChip, fontWeight: 700 }}>
              + {hiddenCount} more
            </button>
          )}
        </div>

        <button type="button" onClick={apply} style={applyBtn}>
          {/* "Show N recipes" wants a count against the not-yet-applied
              combination, which needs a count endpoint the SPA does not have.
              The handoff's sanctioned fallback rather than a guessed number. */}
          Show results
        </button>
      </div>
    </Modal>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: 'var(--muted)',
        marginBottom: 9,
      }}
    >
      {children}
    </div>
  )
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        flexShrink: 0,
        fontSize: 13,
        fontWeight: 600,
        padding: '8px 16px',
        borderRadius: 999,
        border: `1px solid ${active ? 'var(--accent-fill)' : 'var(--border)'}`,
        background: active ? 'var(--accent-fill)' : 'var(--surface)',
        color: active ? 'var(--accent-ink)' : 'var(--muted)',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

const clearAllLink: CSSProperties = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  padding: 0,
}

const cuisineRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  border: '1px solid var(--border)',
  borderRadius: 12,
  background: 'var(--surface)',
  padding: '11px 13px',
  fontSize: 13.5,
}

const tagChip: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 999,
  border: 'none',
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const applyBtn: CSSProperties = {
  width: '100%',
  border: 'none',
  borderRadius: 12,
  padding: '13px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}
