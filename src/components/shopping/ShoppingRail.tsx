// ─────────────────────────────────────────────────────────────────────────
// The desktop rail (shop redesign) — everything the list column deliberately
// does NOT say.
//
// The list is one column of rows at reading width; the rail is where the week
// answers back: how far through you are, which aisle is next, and which dishes
// this is all for. None of it is actionable except the aisle jumps, and that is
// the point — a rail full of buttons would compete with the list.
//
// It swaps wholesale in multi-select. The design replaces the whole rail rather
// than adding a panel to it, because during a bulk action the only question is
// "what have I got hold of" — progress and dishes are noise you are about to
// change anyway.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'
import type { AisleSummary, DishSummary, ShoppingItem } from './shoppingModel'

interface ShoppingRailProps {
  purchased: number
  total: number
  aisles: AisleSummary[]
  dishes: DishSummary[]
  /** The aisle the list is currently scrolled to — highlighted, not selected. */
  currentAisle: string | null
  onJumpToAisle: (aisle: string) => void
  /** Non-empty means the rail describes the selection instead. */
  selected: ShoppingItem[]
  selectionDescription: string
}

export default function ShoppingRail({
  purchased,
  total,
  aisles,
  dishes,
  currentAisle,
  onJumpToAisle,
  selected,
  selectionDescription,
}: ShoppingRailProps) {
  if (selected.length > 0) {
    return <SelectionRail selected={selected} description={selectionDescription} />
  }

  const remaining = total - purchased
  const aislesOwing = aisles.filter((aisle) => aisle.remaining > 0).length
  const percent = total === 0 ? 0 : Math.round((purchased / total) * 100)

  return (
    <aside style={rail}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={label}>PROGRESS</span>
          <span style={progressCount}>
            {purchased} / {total}
          </span>
        </div>
        <div style={track}>
          <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-fill)' }} />
        </div>
        <div style={{ marginTop: 9, fontSize: 12.5, color: 'var(--muted)' }}>
          {remaining === 0
            ? 'Everything on this list is bought.'
            : `${remaining} left across ${aislesOwing} ${aislesOwing === 1 ? 'aisle' : 'aisles'}`}
        </div>
      </div>

      <div>
        <div style={{ ...label, marginBottom: 9, display: 'block' }}>AISLES</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {aisles.map((aisle) => {
            const current = aisle.aisle === currentAisle
            return (
              <button
                key={aisle.aisle}
                type="button"
                onClick={() => onJumpToAisle(aisle.aisle)}
                style={{ ...jumpRow, ...(current ? jumpRowCurrent : null) }}
              >
                <span
                  style={{
                    ...jumpName,
                    color: current ? 'var(--text)' : 'var(--muted)',
                  }}
                >
                  {aisle.aisle}
                </span>
                <span
                  style={{
                    ...jumpCount,
                    color: current ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  {aisle.remaining}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {dishes.length > 0 && (
        <div>
          <div style={{ ...label, marginBottom: 9, display: 'block' }}>THIS WEEK'S DISHES</div>
          <div style={{ ...card, padding: '5px 15px 8px' }}>
            {dishes.map((dish, index) => (
              <div
                key={dish.title}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 9,
                  padding: '9px 0',
                  borderBottom: index === dishes.length - 1 ? 'none' : '1px solid var(--hair)',
                }}
              >
                <span style={dayLabel}>{dish.date ? dayOf(dish.date) : ''}</span>
                <span style={dishTitle}>{dish.title}</span>
                <span style={dishCount}>
                  {dish.bought}/{dish.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={footnote}>
        Shared items are bought once, under the first dish that needs them.
      </div>
    </aside>
  )
}

/** The multi-select rail: what is held, and the keys that act on it. */
function SelectionRail({ selected, description }: { selected: ShoppingItem[]; description: string }) {
  const aisles = [...new Set(selected.map((item) => item.aisle))]
  const dishes = [...new Set(selected.flatMap((item) => (item.ownerDish ? [item.ownerDish] : [])))]

  return (
    <aside style={{ ...rail, gap: 14 }}>
      <div style={label}>SELECTION</div>
      <div style={card}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 600 }}>
          {selected.length} {selected.length === 1 ? 'item' : 'items'}
          {aisles.length === 1 ? `, all ${aisles[0]}` : `, across ${aisles.length} aisles`}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.55 }}>
          {description}
          {dishes.length > 0 && ` — spans ${dishes.length} ${dishes.length === 1 ? 'dish' : 'dishes'}: ${dishes.join(', ')}.`}
        </div>
      </div>

      {/* Shown, not just bound: a keyboard shortcut nobody can see is a shortcut
          nobody uses. These mirror the handlers on the page. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Shortcut glyph="⌘A" label="Select everything" />
        <Shortcut glyph="Enter" label="Tick selection" />
        <Shortcut glyph="Del" label="Remove selection" />
        <Shortcut glyph="Esc" label="Cancel" />
      </div>

      <div style={footnote}>
        Desktop needs no long-press — checkboxes are always visible, and the aisle checkbox
        takes the whole section.
      </div>
    </aside>
  )
}

/**
 * The key names are WORDS, not the ⏎ / ⌫ symbols the mock draws them with, and
 * they are set in the UI face rather than the display serif. Fraunces has no
 * glyph for either symbol, so both fell through to a fallback and rendered as
 * empty boxes — a shortcut hint nobody can read is worse than no hint. ⌘ survives
 * because the fallback stack does carry it.
 */
function Shortcut({ glyph, label: text }: { glyph: string; label: string }) {
  return (
    <div style={shortcut}>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', width: 34, flexShrink: 0 }}>
        {glyph}
      </span>
      {text}
    </div>
  )
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

const rail: CSSProperties = {
  width: 328,
  flexShrink: 0,
  borderLeft: '1px solid var(--border)',
  background: 'var(--navbg)',
  padding: '22px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  overflowY: 'auto',
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '16px 17px',
}

const label: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: '0.08em',
  color: 'var(--muted)',
}

const progressCount: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 19,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
}

const track: CSSProperties = {
  height: 6,
  borderRadius: 99,
  background: 'var(--surface2)',
  marginTop: 11,
  overflow: 'hidden',
}

const jumpRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  cursor: 'pointer',
  borderRadius: 11,
  padding: '9px 12px',
  border: '1px solid transparent',
  background: 'transparent',
  fontFamily: 'inherit',
  textAlign: 'left',
}

const jumpRowCurrent: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
}

const jumpName: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  fontWeight: 600,
}

const jumpCount: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
  fontVariantNumeric: 'tabular-nums',
}

const dayLabel: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  fontSize: 12,
  color: 'var(--muted)',
  width: 34,
  flexShrink: 0,
}

const dishTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 14.5,
  fontWeight: 600,
  flex: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
}

const dishCount: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
  flexShrink: 0,
}

const shortcut: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  borderRadius: 11,
  padding: '10px 13px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  fontSize: 13.5,
  fontWeight: 700,
}

const footnote: CSSProperties = {
  marginTop: 'auto',
  fontSize: 12,
  color: 'var(--muted)',
  lineHeight: 1.5,
}
