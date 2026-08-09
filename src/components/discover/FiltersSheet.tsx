// ─────────────────────────────────────────────────────────────────────────
// The Discover filter sheet (Discover redesign, §B).
//
// Replaces the always-open inline panel — difficulty pills, a cuisine select
// and all 39 tag chips stacked above the results — with a sheet the user opens
// deliberately. That panel cost every visitor a screenful of controls to reach
// the recipes; the count on the trigger ("Filters (3)") is what it is replaced
// by, and it is the ONLY filter state shown outside the sheet.
//
// Bottom sheet on a phone, anchored panel on desktop — both through the shared
// Modal primitive, so focus trapping, Escape and focus restore come for free.
//
// The desktop half used to be Modal's "center" variant, which is a 380px card
// however wide the viewport is: a phone-shaped dialog floating in the middle of
// a 1440px page, with the dimmed backdrop hiding the very results you were
// filtering. It is now an undimmed panel hanging off the Filters button, laying
// the same three groups out in columns instead of stacking them.
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

/**
 * The phone sheet cuts the tag list at 8 because it is a single narrow column.
 * The desktop panel gives tags the full 620px width, where twice as many fit on
 * the same three rows — so "+ N more" stops being the first thing you must
 * click to find anything.
 */
export const VISIBLE_TAGS_DESKTOP = 16

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

/**
 * Where the desktop panel hangs, in px from the frame's top-right.
 *
 * Derived from BrowsePage's desktop chrome: 28px of page padding, then the
 * ~44px masthead row the Filters button sits in, then a 9px gap — so the panel
 * meets the bottom edge of its own trigger. `right` is BrowsePage's 34px page
 * padding, which lines the panel's right edge up with the button's.
 *
 * Fixed rather than measured on purpose: the sheet is rendered outside the
 * page's scroll container (see BrowsePage), so a measured anchor would drift
 * with the list scrolling underneath it.
 */
const DESKTOP_ANCHOR = { top: 81, right: 34, width: 620 } as const

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
  const cut = isDesktop ? VISIBLE_TAGS_DESKTOP : VISIBLE_TAGS
  const visible = expanded
    ? tagRanking
    : Array.from(new Set([...draftTags, ...tagRanking.slice(0, cut)]))
  const hiddenCount = tagRanking.length - visible.length

  const draftCount = (draftDifficulty ? 1 : 0) + (draftCuisine ? 1 : 0) + draftTags.length

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

  // Desktop lays the three groups out as a grid — difficulty and cuisine share
  // a row, tags span the full width because 16 chips need it. On a phone the
  // groups stay stacked, each carrying its own bottom margin as before.
  //
  // The tracks are 1.5:1, not even: the four difficulty pills need 316px to sit
  // on one line and an even split gives them 274, which orphans "Hard" onto a
  // row of its own. Cuisine is one select and has width to spare. minmax(0, …)
  // rather than bare fr for the usual reason — an fr track's min-content floor
  // lets a long cuisine name push the row wider than the panel.
  const groupsStyle: CSSProperties | undefined = isDesktop
    ? {
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
        gap: '20px 26px',
        marginBottom: 20,
      }
    : undefined
  const group = (span = false): CSSProperties =>
    isDesktop ? (span ? { gridColumn: '1 / -1' } : {}) : { marginBottom: span ? 20 : 18 }

  return (
    <Modal
      onClose={onClose}
      label="Filters"
      variant={isDesktop ? 'anchored' : 'bottom'}
      anchor={isDesktop ? DESKTOP_ANCHOR : undefined}
    >
      <div
        style={
          isDesktop
            ? {
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                // A panel floating over live content needs to read as lifted,
                // which --cardsh (a resting card) does not do on its own.
                boxShadow: '0 18px 44px -20px rgba(0, 0, 0, 0.45)',
                borderRadius: 18,
                padding: '20px 22px',
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

        <div style={groupsStyle}>
          <div style={group()}>
            <FieldLabel>DIFFICULTY</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
          </div>

          <div style={group()}>
            <FieldLabel>CUISINE</FieldLabel>
            {/* The real <select> rides invisibly on top of the styled row, so
                the row looks like the rest of the sheet while the picker that
                opens is still the platform's own. */}
            <div style={{ position: 'relative' }}>
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
          </div>

          <div style={group(true)}>
            <FieldLabel>TAGS</FieldLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
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
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  style={{ ...tagChip, fontWeight: 700 }}
                >
                  + {hiddenCount} more
                </button>
              )}
            </div>
          </div>
        </div>

        {/* "Show N recipes" wants a count against the not-yet-applied
            combination, which needs a count endpoint the SPA does not have.
            The handoff's sanctioned fallback rather than a guessed number.
            Desktop has the width for a footer row, so it says how many filters
            the draft holds instead of leaving the button to carry everything. */}
        {isDesktop ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              borderTop: '1px solid var(--hair)',
              paddingTop: 16,
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {draftCount === 0
                ? 'No filters selected'
                : `${draftCount} filter${draftCount === 1 ? '' : 's'} selected`}
            </span>
            <button
              type="button"
              onClick={apply}
              style={{ ...applyBtn, width: 'auto', marginLeft: 'auto', padding: '12px 22px' }}
            >
              Show results
            </button>
          </div>
        ) : (
          <button type="button" onClick={apply} style={applyBtn}>
            Show results
          </button>
        )}
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
