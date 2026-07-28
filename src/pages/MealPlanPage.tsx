// ─────────────────────────────────────────────────────────────────────────
// Weekly meal-plan surface (/plan) — meal-planning-ui plan, Task 4 shell.
//
// Header, resolved week label, and either the "Start this week" call to action
// (the week has no plan yet) or Task 5's read-only WeekGrid for the resolved
// plan. No nav entry links here until Task 9.
//
// `weekStart` is held in state deliberately: Task 6 adds prev/next week
// navigation by moving this value, with no restructuring of the page.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { weekStartOf } from '@/api/mealPlans'
import { useCurrentWeekPlan, useEnsureWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import StateBlock from '@/components/ui/StateBlock'
import WeekGrid from '@/components/mealplan/WeekGrid'

const pageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  padding: '54px 18px 24px',
}

const startButtonStyle: React.CSSProperties = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 13,
  padding: '11px 16px',
  fontFamily: 'inherit',
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 20,
  padding: 18,
}

/** "Mon 27 Jul – Sun 2 Aug" for the week beginning at the given UTC-midnight Monday. */
export function weekRangeLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    })
  return `${fmt(start)} – ${fmt(end)}`
}

export default function MealPlanPage() {
  const [weekStart] = useState(() => weekStartOf(new Date()))
  const { planId, isLoading, error } = useCurrentWeekPlan(weekStart)
  const ensure = useEnsureWeekPlan()
  const detail = useMealPlanDetail(planId)

  return (
    <div className="scroll" style={pageStyle}>
      <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Meal plan</h1>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 18px' }}>{weekRangeLabel(weekStart)}</div>

      {isLoading && <StateBlock title="Loading your week…" />}

      {!isLoading && error && (
        <StateBlock title="Couldn't load this week" body="Check your connection and try again." />
      )}

      {!isLoading && !error && planId === null && (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>No plan for this week yet</div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, margin: '6px auto 16px', maxWidth: 320 }}>
            Start a plan to fill breakfast, lunch and dinner across the week.
          </div>
          <button
            type="button"
            style={startButtonStyle}
            disabled={ensure.isPending}
            onClick={() => ensure.mutate(weekStart)}
          >
            {ensure.isPending ? 'Starting…' : 'Start this week'}
          </button>
        </div>
      )}

      {!isLoading && !error && planId !== null && (
        <>
          {detail.isLoading && <StateBlock title="Loading your week…" />}
          {!detail.isLoading && detail.error && (
            <StateBlock title="Couldn't load this week" body="Check your connection and try again." />
          )}
          {!detail.isLoading && !detail.error && <WeekGrid entries={detail.data?.entries ?? []} />}
        </>
      )}
    </div>
  )
}
