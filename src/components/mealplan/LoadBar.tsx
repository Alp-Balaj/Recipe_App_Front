// ─────────────────────────────────────────────────────────────────────────
// One day's figure, drawn against the week's own scale (week/shopping rework, Task 8).
//
// The whole reason the week board has no footer chart: the bar lives IN the row
// it describes, so the evidence and the verdict are on the same line and nobody
// has to eye-match a bar in a summary to a column in a grid.
//
// `max` is the week's heaviest day and `average` is the week's own average, both
// passed in — "heavy" and "light" are relative to what THIS week asked, not to
// some fixed number. That is what makes "2× average" legible without a second
// chart: the marker is already sitting there.
//
// The figure carries its own unit ("140m", "1,900 planned kcal") but NOT its
// column name — a bar cannot know it is in a column. The row supplies that as
// visually-hidden text, so "not counted" can never be read against effort.
//
// `unknown` is the calorie honesty rule made visible. A day with any planned
// dish lacking a figure is NOT a short bar and NOT a hole: a short bar reads as
// "a light day", and a day whose lunch merely has no calorie figure is not a
// light day. So it gets a hatched track and says so in words.
//
// Presentational — every decision about which figure this is belongs to the row.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'

interface Props {
  value: number
  /** The week's heaviest day, so every row is drawn to the same scale. */
  max: number
  /** The week's own average, drawn as a marker. Omitted/0 draws none. */
  average?: number
  /** Suffix for the figure: 'm', ' planned kcal'. Carried into the reading too. */
  unit: string
  /** No honest figure exists — hatched, and captioned "not counted". */
  unknown?: boolean
}

export default function LoadBar({ value, max, average = 0, unit, unknown = false }: Props) {
  if (unknown) {
    return (
      <div style={cell}>
        <span style={hatched} aria-hidden="true" />
        <span style={notCounted}>not counted</span>
      </div>
    )
  }

  // A week whose heaviest day IS this day still draws a full bar rather than
  // dividing by zero; a max of 0 can only mean nothing is planned at all.
  const fraction = max > 0 ? Math.min(1, value / max) : 0
  const marker = max > 0 && average > 0 ? Math.min(1, average / max) : null

  return (
    <div style={cell}>
      <span style={track} aria-hidden="true">
        <span style={{ ...fill, width: `${fraction * 100}%` }} />
        {marker !== null && <span style={{ ...averageMark, left: `${marker * 100}%` }} />}
      </span>
      <span style={figure}>
        {value.toLocaleString()}
        {unit}
      </span>
    </div>
  )
}

const cell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
}

const track: CSSProperties = {
  position: 'relative',
  display: 'block',
  height: 6,
  borderRadius: 3,
  background: 'var(--surface2)',
  overflow: 'hidden',
}

const fill: CSSProperties = {
  position: 'absolute',
  inset: '0 auto 0 0',
  borderRadius: 3,
  background: 'var(--accent)',
}

// The average marker sits INSIDE the track rather than under it: a tick below
// the bar would need its own label to be readable, and the row has one figure's
// worth of room, not two.
const averageMark: CSSProperties = {
  position: 'absolute',
  top: -1,
  bottom: -1,
  width: 2,
  marginLeft: -1,
  background: 'var(--muted)',
  opacity: 0.85,
}

// Hatching, not a colour: an uncounted day must not read as a MEASURED low one,
// and any solid fill — however pale — is still a length you can compare.
const hatched: CSSProperties = {
  display: 'block',
  height: 6,
  borderRadius: 3,
  border: '1px dashed var(--border)',
  background:
    'repeating-linear-gradient(115deg, var(--surface2) 0 4px, transparent 4px 8px)',
}

// NOT nowrap: "1,900 planned kcal" is ~125px of text in a ~112px cell, so it
// wrapped OUT of the row instead of onto a second line. The figure wraps and the
// cell keeps its width, which is what keeps the columns aligned row to row.
const figure: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: '-0.01em',
  lineHeight: 1.25,
  fontVariantNumeric: 'tabular-nums',
  overflowWrap: 'anywhere',
}

const notCounted: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--muted)',
  lineHeight: 1.25,
}
