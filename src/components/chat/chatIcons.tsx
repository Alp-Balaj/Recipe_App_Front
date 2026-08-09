import type { CSSProperties } from 'react'

/**
 * Glyphs local to the chat surface, on the same 24-unit grid as navIcons.
 *
 * They live here rather than in navIcons because that file is the shell's
 * shared chrome vocabulary (nav tabs, theme toggle, the "+" CTA) and these are
 * one page's mode vocabulary. The pair that matters is Search and Spark: they
 * are what separates "find what I already have" from "invent something new" at
 * the two places the distinction is easiest to miss — the tab and the send
 * button. That separation must not rest on colour, because in the LIGHT theme
 * it can't: --olive is literally --accent-fill (index.css:233), so the two
 * modes' accents are one step apart in lightness. Shape is the signal that
 * survives greyscale, low light and colourblindness; colour merely agrees with
 * it in dark mode.
 */
interface IconProps {
  size?: number
  style?: CSSProperties
}

function Svg({ size = 20, style, children, width }: IconProps & { children: React.ReactNode; width?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width ?? 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  )
}

/** Library mode — a magnifier. Searching what already exists. */
export function SearchIcon({ size, style }: IconProps) {
  return (
    <Svg size={size} style={style} width={2.2}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.7-3.7" />
    </Svg>
  )
}

/** Create mode — a spark. Something that wasn't there before. */
export function SparkIcon({ size, style }: IconProps) {
  return (
    <Svg size={size} style={style} width={2}>
      <path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9-1.9 5.3-1.9-5.3-5.3-1.9 5.3-1.9z" />
    </Svg>
  )
}

/** The library composer's send arrow. */
export function SendArrowIcon({ size, style }: IconProps) {
  return (
    <Svg size={size} style={style} width={2.4}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </Svg>
  )
}

/** The Create tab's context chip — a signal being read off the thread. */
export function ThreadContextIcon({ size, style }: IconProps) {
  return (
    <Svg size={size} style={style} width={2.1}>
      <path d="M4 12h4l3 7 2-14 3 7h4" />
    </Svg>
  )
}

/** Quota spent — a clock, because the answer is "later", not "no". */
export function ClockIcon({ size, style }: IconProps) {
  return (
    <Svg size={size} style={style}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.4V12l3 2" />
    </Svg>
  )
}

/** The "+" as content rather than chrome — used only where manual entry is the answer. */
export function PlusGlyph({ size, style }: IconProps) {
  return (
    <Svg size={size} style={style} width={2.3}>
      <path d="M12 5.2v13.6M5.2 12h13.6" />
    </Svg>
  )
}
