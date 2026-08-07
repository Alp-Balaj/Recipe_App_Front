// ─────────────────────────────────────────────────────────────────────────
// The shopping list's glyphs (shop redesign).
//
// Same 24-unit grid and the same `currentColor` stroke as navIcons.tsx, so `size`
// is the real rendered size and callers keep driving colour with the existing
// tokens. They live here rather than in navIcons because none of them is nav
// chrome — navIcons is the shell's alphabet, and a receipt is not part of it.
//
// The check carries its own weight (a tick drawn at nav's 1.8 looks broken inside
// a filled 21px box), which is why it takes `strokeWidth` rather than inheriting.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactNode } from 'react'

export interface ShopIconProps {
  size?: number
  style?: CSSProperties
}

function Svg({
  size = 18,
  style,
  strokeWidth = 1.9,
  children,
}: ShopIconProps & { strokeWidth?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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

/** The tick inside a checked box, and on every "Tick n" button. */
export function CheckIcon({ strokeWidth = 3.2, ...props }: ShopIconProps & { strokeWidth?: number }) {
  return (
    <Svg {...props} strokeWidth={strokeWidth}>
      <path d="M5 12.8l4.4 4.4L19 7.6" />
    </Svg>
  )
}

/** Scan receipt — a till roll with its torn bottom edge. */
export function ReceiptIcon(props: ShopIconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M6.5 3.5h11v17l-2-1.4-1.8 1.4-1.7-1.4L10.3 20.5l-1.9-1.4-1.9 1.4z" />
      <path d="M9.5 8h5M9.5 11.5h5" />
    </Svg>
  )
}

/**
 * Remove a row — suppress a derived one, delete a manual one.
 *
 * Takes a weight because it is drawn at two very different sizes: 15px inside a
 * hover button, where the default reads right, and 18px on the swipe action's
 * solid clay, where a hairline outline disappears.
 */
export function TrashIcon({ strokeWidth = 1.9, ...props }: ShopIconProps & { strokeWidth?: number }) {
  return (
    <Svg {...props} strokeWidth={strokeWidth}>
      <path d="M4 8h16M9 8V5.5h6V8M6.5 8l1 12h9l1-12" />
    </Svg>
  )
}

/** The note that says what a multi-selection currently is. */
export function InfoIcon(props: ShopIconProps) {
  return (
    <Svg {...props} strokeWidth={2}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v.6M12 11.4v4.6" />
    </Svg>
  )
}
