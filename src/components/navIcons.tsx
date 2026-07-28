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
