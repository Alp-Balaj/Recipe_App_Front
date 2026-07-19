// ─────────────────────────────────────────────────────────────────────────
// Shared chrome for the account-settings screens (design 3e/3f). Every
// sub-screen is a full-height scroll frame with a circular back control and a
// bold title, matching the Settings gear screen. Rows, section labels, and the
// card shell are factored here so the menu and each detail screen read as one
// system. Themed via CSS variables so light + dark both work.
// ─────────────────────────────────────────────────────────────────────────

import type { CSSProperties, ReactNode } from 'react'

export function SettingsScreen({
  title,
  onBack,
  right,
  children,
}: {
  title: string
  onBack: () => void
  /** Optional trailing header control (e.g. the Edit-profile "Save" button). */
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="scroll" style={page}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={onBack} aria-label="Back" style={backBtn}>
          ←
        </button>
        <div style={{ flex: 1, fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...sectionLabel, ...style }}>{children}</div>
}

/** A grouped card that hairlines its direct children (the design's row lists). */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div style={{ ...cardShell, overflow: 'hidden' }}>{children}</div>
}

/** A navigational row: icon · label · chevron. */
export function NavRow({
  icon,
  label,
  onClick,
  last,
}: {
  icon: string
  label: string
  onClick: () => void
  /** Suppress the bottom hairline on the final row of a group. */
  last?: boolean
}) {
  return (
    <button onClick={onClick} style={{ ...rowBase, borderBottom: last ? 'none' : hairline }}>
      <span style={{ color: 'var(--accent)', fontSize: 16, width: 20, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
      <span style={{ color: 'var(--muted)' }}>›</span>
    </button>
  )
}

/** A toggle row backed by a boolean (client-side preference). */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  last,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (next: boolean) => void
  last?: boolean
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px 15px',
        borderBottom: last ? 'none' : hairline,
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        {hint && (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{hint}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 26,
          borderRadius: 999,
          border: 'none',
          cursor: 'pointer',
          padding: 3,
          display: 'flex',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          background: checked ? 'var(--accent)' : 'var(--surface2)',
          transition: 'background 0.18s',
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: checked ? 'var(--accent-ink)' : 'var(--muted)',
            transition: 'background 0.18s',
          }}
        />
      </button>
    </label>
  )
}

const hairline = '1px solid var(--border)'

export const page: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

const backBtn: CSSProperties = {
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  width: 34,
  height: 34,
  borderRadius: '50%',
  cursor: 'pointer',
  fontSize: 16,
  fontFamily: 'inherit',
  flexShrink: 0,
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  fontWeight: 700,
  margin: '6px 4px 10px',
}

export const cardShell: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
}

const rowBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '14px 15px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
}
