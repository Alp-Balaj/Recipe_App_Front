// ─────────────────────────────────────────────────────────────────────────
// One line of the shopping list (shop redesign, direction 1c).
//
// The row carries four gestures and they must not collide:
//
//  · TICK — the checkbox, or the row itself. The row dims IN PLACE and never
//    moves. Ticking is the thing you do fifty times in a shop with one thumb.
//  · SWIPE (touch only) — right ticks, left removes, both revealing a coloured
//    action behind the row. Disabled on a mouse: the design gives desktop hover
//    actions instead, and a click-drag that deleted a row would be a trap.
//  · LONG-PRESS (touch only) — enters multi-select. Desktop has no equivalent
//    and needs none: its checkboxes are permanent and the aisle header selects
//    a whole section in one click.
//  · REMOVE — the hover button on desktop, the left swipe on touch.
//
// Once a selection exists the row's meaning CHANGES: the checkbox toggles
// membership rather than bought, and its accessible name says so. That is the
// one place this component is not purely presentational, and it is deliberate —
// a checkbox whose label lies about what it does is worse than a prop.
// ─────────────────────────────────────────────────────────────────────────

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { CheckIcon, TrashIcon } from './shopIcons'
import { isDone, provenanceOf, type GroupBy, type ShoppingItem } from './shoppingModel'

/** Past this share of the row's width, releasing commits the action. */
const COMMIT_FRACTION = 0.35
/** Below this, a drag is still deciding whether it is a scroll. */
const INTENT_PX = 8
const LONG_PRESS_MS = 450

interface ShoppingRowProps {
  item: ShoppingItem
  /** Which heading the row sits under — it decides what the provenance line says. */
  groupBy: GroupBy
  /** Phone metrics — tighter padding, smaller type, no fixed amount column. */
  compact: boolean
  /** Touch affordances. Off on desktop, where hover actions replace them. */
  gestures: boolean
  selectionMode: boolean
  selected: boolean
  /** Explicit next value — the mark write is an explicit set, never a toggle. */
  onToggleBought: (isPurchased: boolean) => void
  onRemove: () => void
  /** `extend` is a shift-click: take everything between the last click and this. */
  onSelect: (extend: boolean) => void
  onLongPress: () => void
}

export default function ShoppingRow({
  item,
  groupBy,
  compact,
  gestures,
  selectionMode,
  selected,
  onToggleBought,
  onRemove,
  onSelect,
  onLongPress,
}: ShoppingRowProps) {
  const [dx, setDx] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const gesture = useRef<{ x: number; y: number; width: number; locked: boolean } | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const provenance = provenanceOf(item, groupBy)
  // Resolved reads like bought — struck and dimmed — because to the shopper they mean the
  // same thing: do not buy this. The REASON is what keeps that honest; a row that quietly
  // struck itself out with no explanation is the distrust this roadmap exists to remove.
  //
  // isDone, not a local `item.bought || item.resolved`: the page's counters use that
  // function, and a second copy here is how a struck row ends up counted as remaining.
  //
  // The checkbox itself — its real `checked`, the drawn box mirroring that state, and
  // what `onToggleBought` sends — stays on `item.bought` alone. Resolution never round-
  // trips, so folding it in there would either lie to a screen reader (checked ≠
  // aria-checked) or tap-and-nothing-visibly-changes the first time you tick a resolved
  // row (it was already drawn checked; only strike/dim read `done`).
  const done = isDone(item)
  const reason = item.resolved ? 'Already cooked' : null
  const reasonLine = [provenance, reason].filter(Boolean).join(' · ') || null
  const swiping = dx !== 0

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Mouse and pen keep the desktop vocabulary. Only a finger swipes.
    if (!gestures || event.pointerType !== 'touch') return
    const target = event.currentTarget
    gesture.current = { x: event.clientX, y: event.clientY, width: target.offsetWidth || 320, locked: false }

    if (!selectionMode) {
      pressTimer.current = setTimeout(() => {
        pressTimer.current = null
        gesture.current = null
        setDx(0)
        onLongPress()
      }, LONG_PRESS_MS)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current
    if (!active) return

    const deltaX = event.clientX - active.x
    const deltaY = event.clientY - active.y

    if (!active.locked) {
      // Vertical intent WINS. The list scrolls under a thumb far more often than
      // it swipes, and a row that grabs the gesture at 9px of drift makes the
      // page feel stuck.
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > INTENT_PX) {
        cancelPress()
        gesture.current = null
        return
      }
      if (Math.abs(deltaX) < INTENT_PX) return
      active.locked = true
      cancelPress()
    }

    setDx(deltaX)
  }

  const onPointerUp = () => {
    const active = gesture.current
    cancelPress()
    gesture.current = null
    if (!active?.locked) {
      setDx(0)
      return
    }

    const threshold = active.width * COMMIT_FRACTION
    if (dx >= threshold) onToggleBought(!item.bought)
    else if (dx <= -threshold) onRemove()
    // Either way the row springs back to zero: a committed tick re-renders as a
    // dimmed row in place, and a committed remove takes the row with it.
    setDx(0)
  }

  const activate = (extend: boolean) => {
    if (selectionMode) onSelect(extend)
    else onToggleBought(!item.bought)
  }

  const size = compact ? 20 : 21

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        // The action colour lives on the WRAPPER and is only ever seen through the
        // space the row vacates — which is why the row content keeps its own
        // opaque background below.
        background: swiping ? (dx > 0 ? 'var(--accent-fill)' : 'var(--clay)') : 'transparent',
        borderRadius: swiping ? 11 : 0,
      }}
    >
      {swiping && (
        <div style={dx > 0 ? swipeLeft : swipeRight} aria-hidden>
          {dx > 0 ? (
            <>
              <CheckIcon size={19} strokeWidth={3} />
              <span style={swipeLabel}>GOT IT</span>
            </>
          ) : (
            <>
              <span style={swipeLabel}>REMOVE</span>
              <TrashIcon size={18} strokeWidth={2} />
            </>
          )}
        </div>
      )}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(event) => {
          // A click that ends a swipe is not a tap.
          if (swiping) return
          activate(event.shiftKey)
        }}
        style={{
          ...rowStyle(compact),
          ...(selected ? selectedStyle : null),
          ...(hovered && !selected && !compact ? hoverStyle : null),
          opacity: done && !selected ? 0.5 : 1,
          transform: swiping ? `translateX(${dx}px)` : undefined,
          // Only while a finger is on it — a permanent transition would make every
          // re-render of a fifty-row list animate.
          transition: swiping ? 'none' : 'transform 160ms ease',
          // Opaque only while sliding, so the action colour behind shows in the
          // vacated space and nowhere else. At rest the row is transparent unless
          // the selected/hover spreads above tinted it.
          ...(swiping ? { background: 'var(--bg)' } : null),
          touchAction: gestures ? 'pan-y' : undefined,
        }}
      >
        <span style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
          <input
            type="checkbox"
            // In selection mode the box means "in the selection", so it says so.
            aria-label={selectionMode ? `Select ${item.name}` : item.name}
            checked={selectionMode ? selected : item.bought}
            onClick={(event) => event.stopPropagation()}
            // Never extends. Shift-click lives on the row BODY, where the modifier
            // is readable from a plain click event — a change event carries no
            // modifier state, and reconstructing it from the click that caused it
            // depends on an activation order that differs across browsers.
            onChange={() => activate(false)}
            style={hiddenInput}
          />
          <span
            aria-hidden
            style={{
              ...box,
              width: size,
              height: size,
              ...((selectionMode ? selected : item.bought)
                ? { background: 'var(--accent-fill)', border: 'none', color: 'var(--accent-ink)' }
                : null),
            }}
          >
            {(selectionMode ? selected : item.bought) && <CheckIcon size={compact ? 12 : 13} />}
          </span>
        </span>

        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: compact ? 14.5 : 15.5,
              fontWeight: 700,
              textDecoration: done ? 'line-through' : 'none',
              overflowWrap: 'anywhere',
            }}
          >
            {item.name}
          </span>
          {reasonLine && (
            <span style={{ ...provenanceStyle, fontSize: compact ? 11.5 : 12.5 }}>{reasonLine}</span>
          )}
        </span>

        {/* Remove. Only remove: there is no edit verb on this surface — a derived
            quantity comes from the recipe, and a manual row has no endpoint to
            change it through.

            It is ALWAYS in the DOM, and that is the accessibility fix the mock
            does not describe. The design reveals it on desktop hover and gives
            touch a left-swipe instead — which leaves a keyboard or screen-reader
            user on a narrow viewport with no way to remove anything at all. So it
            stays reachable and merely goes visually hidden until it is hovered or
            FOCUSED, at which point it takes its drawn size back. */}
        {!selectionMode && (
          <button
            type="button"
            aria-label={`Remove ${item.name}`}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onClick={(event) => {
              event.stopPropagation()
              onRemove()
            }}
            style={(!compact && hovered) || focused ? actionButton : visuallyHidden}
          >
            <TrashIcon size={15} />
          </button>
        )}

        <span style={{ ...amount, width: compact ? undefined : 56 }}>{item.amount}</span>
      </div>
    </div>
  )
}

const rowStyle = (compact: boolean): CSSProperties => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: compact ? 11 : 14,
  padding: compact ? '9px 2px' : '11px 10px',
  borderBottom: '1px solid var(--hair)',
  cursor: 'pointer',
  userSelect: 'none',
})

// Height is IDENTICAL to an unselected row — the bottom rule goes transparent
// rather than away, so selecting a row never nudges the list under your finger.
// The ring is an inset shadow for the same reason a border would not do.
const selectedStyle: CSSProperties = {
  borderRadius: 11,
  borderBottomColor: 'transparent',
  background: 'var(--chipbg)',
  boxShadow: 'inset 0 0 0 1.5px var(--accent-fill)',
}

const hoverStyle: CSSProperties = {
  background: 'var(--navbg)',
  borderRadius: 10,
}

// The checkbox is a real input, kept invisible over its drawn box: the box can
// then be styled freely while the row keeps a genuine checkbox role, an
// accessible name and keyboard focus.
const hiddenInput: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  opacity: 0,
  cursor: 'pointer',
}

const box: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1.7px solid var(--navidle)',
  color: 'var(--accent-ink)',
  pointerEvents: 'none',
}

// Fraunces italic, and only here: the provenance is the one voice on this page
// that is neither a heading nor a control — it is the list saying what a thing is
// for, which is the display serif's job everywhere else in the app.
const provenanceStyle: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontStyle: 'italic',
  color: 'var(--muted)',
  marginTop: 1,
  overflowWrap: 'anywhere',
}

const amount: CSSProperties = {
  flexShrink: 0,
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
}

const actionButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  width: 28,
  height: 28,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface)',
  color: 'var(--muted)',
  padding: 0,
}

// The remove button at rest: out of sight, still in the accessibility tree and
// still tabbable. Same recipe the page uses for its progress prefix.
const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
  background: 'transparent',
  color: 'inherit',
}

const swipeAction: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--accent-ink)',
}

const swipeLeft: CSSProperties = { ...swipeAction, left: 20 }
const swipeRight: CSSProperties = { ...swipeAction, right: 20, color: 'var(--surface)' }

const swipeLabel: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: '0.04em',
}
