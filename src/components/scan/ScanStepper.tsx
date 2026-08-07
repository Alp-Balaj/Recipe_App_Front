// ─────────────────────────────────────────────────────────────────────────
// The 3-node progress rail on /scan (Scan redesign, "Ask first").
//
// Purely presentational: it derives from where FoodScanPage already is (no
// result → step 1, result loaded → step 2), so there is no second state
// machine to keep in sync with the first.
// ─────────────────────────────────────────────────────────────────────────

import { Fragment } from 'react'

interface ScanStepperProps {
  /** Three labels — "Snap / Review / Cook" or "Snap / Review / Done". */
  steps: readonly [string, string, string]
  /** 1-based. Everything before it reads as done, everything after as to come. */
  current: number
  /** The desktop mock caps the rail at 420px so it does not span the column. */
  maxWidth?: number
}

export default function ScanStepper({ steps, current, maxWidth }: ScanStepperProps) {
  return (
    <div
      role="group"
      aria-label={`Step ${current} of ${steps.length}: ${steps[current - 1]}`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth }}
    >
      {steps.map((label, i) => {
        const step = i + 1
        const active = step === current
        const done = step < current
        return (
          <Fragment key={label}>
            {i > 0 && <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--border)' }} />}
            <span
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              aria-current={active ? 'step' : undefined}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: active ? 'var(--accent)' : 'var(--tagbg)',
                  color: active ? 'var(--accent-ink)' : 'var(--tagcol)',
                }}
              >
                {done ? '✓' : step}
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: active ? 700 : 600,
                  color: active ? 'var(--text)' : 'var(--muted)',
                }}
              >
                {label}
              </span>
            </span>
          </Fragment>
        )
      })}
    </div>
  )
}
