import type { CSSProperties } from 'react'

export interface IconProps {
  size?: number
  style?: CSSProperties
}

/**
 * Nav / chrome glyphs as SVGs on one shared 24-unit grid.
 *
 * They replace the text symbols this shell used to render (✦ ◌ ▤ ◍ ☀ ☾ ＋):
 * those come from different Unicode blocks and cover wildly different amounts
 * of the em box, so one `font-size` produced visibly different icon sizes.
 * Every icon here draws inside the same 24×24 viewBox, so `size` is the real
 * rendered size for all of them. Stroke is `currentColor` — callers keep
 * driving colour with the existing `var(--accent)` / `var(--muted)` inline
 * styles.
 */
function Svg({ size = 20, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
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

/** Feed — a sparkle, echoing the old ✦. */
export function FeedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5l1.9 5.3 5.3 1.9-5.3 1.9-1.9 5.3-1.9-5.3-5.3-1.9 5.3-1.9z" />
      <path d="M18.5 16.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" />
    </Svg>
  )
}

/** Chat — a speech bubble. */
export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20.5 11.8a8 8 0 0 1-11.6 7.2L4 20.4l1.4-4.8A8 8 0 1 1 20.5 11.8z" />
    </Svg>
  )
}

/** Discover — an open recipe book. */
export function DiscoverIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6.6C10.6 5.1 8.6 4.5 5 4.5v13c3.6 0 5.6.6 7 2.1 1.4-1.5 3.4-2.1 7-2.1v-13c-3.6 0-5.6.6-7 2.1z" />
      <path d="M12 6.6v13" />
    </Svg>
  )
}

/** Plan — a week calendar. */
export function PlanIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3.2" />
      <path d="M3.5 10h17M8.5 3.5v3M15.5 3.5v3" />
    </Svg>
  )
}

/** Shop — a shopping bag, echoing the shopping-list tab's own errand. */
export function ShopIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 8.5h11l-1 11.5h-9z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </Svg>
  )
}

/** Profile — a person bust. */
export function ProfileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.8 20c1.1-3.5 3.8-5.4 7.2-5.4s6.1 1.9 7.2 5.4" />
    </Svg>
  )
}

/** The "new recipe" plus. */
export function PlusIcon({ size = 20, style }: IconProps) {
  return (
    <Svg size={size} style={{ strokeWidth: 2.2, ...style }}>
      <path d="M12 5.2v13.6M5.2 12h13.6" />
    </Svg>
  )
}

// ── Feed action glyphs (feed redesign, 2026-08-09) ──────────────────────────
//
// The desktop feed's action row used text symbols (♡ ◌ ↗ ⚐), which was the
// main "unfinished" tell in the old design: they come from different Unicode
// blocks, so they never lined up, and there was no honest filled state — ⚑ for
// "saved" reads as a flag, not as the same bookmark filled in.
//
// These four ride the same 24×24 grid as everything above. `filled` is the
// active state (liked / saved): the SAME path, painted rather than stroked, so
// the shape does not move when it activates. Colour still comes from the
// caller's `currentColor` — `var(--muted)` idle, `var(--accent)` active.

/** Filled variants paint the path and drop the stroke — same geometry, no jump. */
function FilledSvg({ size = 20, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      focusable="false"
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  )
}

const HEART_PATH = 'M12 20.3S4.2 15.4 4.2 10.4a4.3 4.3 0 0 1 7.8-2.5 4.3 4.3 0 0 1 7.8 2.5c0 5-7.8 9.9-7.8 9.9z'
const BOOKMARK_PATH = 'M7 3.6h10a1.4 1.4 0 0 1 1.4 1.4v15.4L12 16.7l-6.4 3.7V5a1.4 1.4 0 0 1 1.4-1.4z'

/** Like — outline by default, painted once the caller has liked it. */
export function HeartIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return filled ? (
    <FilledSvg {...props}>
      <path d={HEART_PATH} />
    </FilledSvg>
  ) : (
    <Svg {...props}>
      <path d={HEART_PATH} />
    </Svg>
  )
}

/** Save — the same outline/filled pair as the heart. */
export function BookmarkIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return filled ? (
    <FilledSvg {...props}>
      <path d={BOOKMARK_PATH} />
    </FilledSvg>
  ) : (
    <Svg {...props}>
      <path d={BOOKMARK_PATH} />
    </Svg>
  )
}

/** Share — an arrow leaving a tray. Stateless: sharing has no "on". */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 15.4V4.3M12 4.3 8.4 7.9M12 4.3l3.6 3.6" />
      <path d="M5.2 13.6v5a1.8 1.8 0 0 0 1.8 1.8h10a1.8 1.8 0 0 0 1.8-1.8v-5" />
    </Svg>
  )
}

// The comment glyph is deliberately NOT a new icon: ChatIcon above is already
// the speech bubble the design asks for, and a second one would drift from it.

/** Theme toggle — sun (shown in dark mode) and moon (shown in light mode). */
export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.5 4.5l1.7 1.7M17.8 17.8l1.7 1.7M2.8 12h2.4M18.8 12h2.4M4.5 19.5l1.7-1.7M17.8 6.2l1.7-1.7" />
    </Svg>
  )
}

export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2z" />
    </Svg>
  )
}
