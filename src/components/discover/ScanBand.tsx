// ─────────────────────────────────────────────────────────────────────────
// The Scan entry point (Discover redesign, section A).
//
// This band is the ONLY promoted way into /scan — before the redesign the page
// was reachable from one link at the bottom of the shopping list, which is why
// the feature was effectively invisible. It sits directly under the cover story
// on purpose: same visual weight class, second thing every visitor sees.
//
// The fill is --accent-grad, the existing rank-progress gradient, rather than a
// new token. Its text colours are fixed rather than themed for the same reason
// the hero's are: they sit on that gradient in both modes.
// ─────────────────────────────────────────────────────────────────────────

import { Link } from 'react-router-dom'

const ON_GRADIENT = '#2b350f'

export default function ScanBand({ isDesktop }: { isDesktop: boolean }) {
  return (
    <Link
      to="/scan"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
        borderRadius: 18,
        padding: isDesktop ? '14px 18px' : '13px 14px',
        background: 'var(--accent-grad)',
        marginBottom: isDesktop ? 24 : 14,
      }}
    >
      <span
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: 'rgba(251,249,239,0.35)',
          color: ON_GRADIENT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <CameraGlyph size={21} />
      </span>

      {isDesktop ? (
        <span style={{ flex: 1, minWidth: 0, color: ON_GRADIENT }}>
          <span style={{ fontSize: 14.5, fontWeight: 800 }}>What&apos;s in your fridge?</span>
          <span style={{ fontSize: 13, opacity: 0.85 }}>
            {' '}
            Point a camera at your shelf — we&apos;ll tell you what you can cook.
          </span>
        </span>
      ) : (
        <span style={{ flex: 1, minWidth: 0, color: ON_GRADIENT }}>
          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800 }}>What&apos;s in your fridge?</span>
          <span style={{ display: 'block', fontSize: 12, marginTop: 1, opacity: 0.85 }}>
            Scan your shelf — we&apos;ll find what you can cook.
          </span>
        </span>
      )}

      {isDesktop ? (
        <span
          style={{
            flexShrink: 0,
            borderRadius: 999,
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 800,
            background: '#fbf9ef',
            color: '#2a261d',
          }}
        >
          Scan your shelf
        </span>
      ) : (
        <span aria-hidden style={{ color: ON_GRADIENT, fontSize: 18, fontWeight: 800 }}>
          ›
        </span>
      )}
    </Link>
  )
}

/**
 * The camera glyph, shared with the scan page's capture zone. Drawn on the same
 * 24-unit grid as everything in navIcons — it just isn't a nav icon, so it does
 * not belong in that file's export list.
 */
export function CameraGlyph({ size = 21 }: { size?: number }) {
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
      style={{ display: 'block', flexShrink: 0 }}
    >
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <circle cx="12" cy="13.5" r="3.6" />
      <path d="M8.5 7l1.2-2.4h4.6L15.5 7" />
    </svg>
  )
}
