// ─────────────────────────────────────────────────────────────────────────
// The list's controls (shop redesign) — the small, repeated chrome the page
// header and the phone's control rows are both built out of.
//
// Two switches that look different because they MEAN different things:
//
//  · SegmentedToggle (By aisle / By dish) re-groups the same rows. Nothing is
//    fetched, nothing leaves the list — so it reads as a physical switch, one
//    pill sliding inside a track.
//  · ScopePills (This week / All) changes the PROJECTION: a different request,
//    possibly several weeks. So it reads as two separate choices, and the live
//    one is filled olive.
//
// Collapsing them into one control would be tidier and wrong: the day somebody
// taps "All" expecting a re-grouping is the day they think the list lost rows.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'

interface SegmentedToggleProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  compact?: boolean
  label: string
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  label,
}: SegmentedToggleProps<T>) {
  return (
    <div style={track} role="group" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            style={{
              ...segment,
              padding: compact ? '5px 11px' : '7px 14px',
              fontSize: compact ? 12.5 : 13,
              ...(on ? segmentOn : { color: 'var(--muted)' }),
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

interface ScopePillsProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  compact?: boolean
  label: string
}

export function ScopePills<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  label,
}: ScopePillsProps<T>) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 7 }} role="group" aria-label={label}>
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option.value)}
            style={{
              ...pill,
              padding: compact ? '5px 10px' : '7px 13px',
              fontSize: compact ? 12 : 13,
              borderRadius: compact ? 10 : 11,
              ...(on ? pillOn : null),
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** A thin olive progress bar — the phone's stand-in for the desktop rail's card. */
export function ProgressBar({ percent, height = 5 }: { percent: number; height?: number }) {
  return (
    <div style={{ flex: 1, height, borderRadius: 99, background: 'var(--surface2)', overflow: 'hidden' }}>
      <div style={{ width: `${percent}%`, height: '100%', background: 'var(--accent-fill)' }} />
    </div>
  )
}

const track: CSSProperties = {
  display: 'flex',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 3,
}

const segment: CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  borderRadius: 9,
  fontFamily: 'inherit',
  fontWeight: 700,
  color: 'var(--text)',
  whiteSpace: 'nowrap',
}

const segmentOn: CSSProperties = {
  background: 'var(--surface)',
  fontWeight: 800,
  boxShadow: '0 1px 3px rgba(60,54,20,0.12)',
}

const pill: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--muted)',
  fontFamily: 'inherit',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const pillOn: CSSProperties = {
  border: '1px solid transparent',
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
  fontWeight: 800,
}
