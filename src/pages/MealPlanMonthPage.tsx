// ─────────────────────────────────────────────────────────────────────────
// The plan's front door (/plan) — meal-plan redesign, month PR.
//
// Replaces the week board here. The board was the prettiest surface but the
// least load-bearing: it could only ever show the current week (there was no
// way to change it), which made the feature unable to do the one thing meal
// planning is for. A month grid is navigable by construction, so that whole
// class of problem stops existing.
//
// What the month can't do — put Tuesday's and Thursday's dinners side by side
// — the week rail buys back cheaply: coverage and repeats per row, since every
// row of a month grid already is a week. The board survives at
// /plan/week/:start, one click away through that rail.
//
// The month lives in ?m=YYYY-MM rather than component state, so a month is
// linkable and the back button steps through the ones you looked at.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMonthPlans } from '@/hooks/useMonthPlans'
import {
  addMonths,
  formatMonthParam,
  formatPlanDate,
  monthGridWeeks,
  monthLabelOf,
  monthStartOf,
  parseMonthParam,
  planDayPath,
  shortMonthOf,
  todayPlanDate,
} from '@/lib/planDates'
import StateBlock from '@/components/ui/StateBlock'
import MonthGrid from '@/components/mealplan/MonthGrid'

const SLOTS_PER_WEEK = 21

export default function MealPlanMonthPage() {
  const [params, setParams] = useSearchParams()
  const today = useMemo(() => todayPlanDate(), [])
  const monthStart = parseMonthParam(params.get('m')) ?? monthStartOf(today)

  const weeks = useMemo(() => monthGridWeeks(monthStart), [monthStart])
  const weekStarts = useMemo(() => weeks.map((week) => formatPlanDate(week[0])), [weeks])
  const { byWeek, isLoading, isError } = useMonthPlans(weekStarts)

  const goToMonth = (next: Date) => setParams({ m: formatMonthParam(next) })

  const planned = weekStarts.reduce((sum, key) => sum + (byWeek.get(key)?.entryCount ?? 0), 0)
  const total = weeks.length * SLOTS_PER_WEEK

  return (
    <div className="scroll" style={pageStyle}>
      <div data-testid="month-canvas" style={canvasStyle}>
        <header style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
              {monthLabelOf(monthStart)}
            </h1>
            <nav style={{ display: 'flex', gap: 6 }} aria-label="Nearby months">
              <button type="button" style={stepButton} onClick={() => goToMonth(addMonths(monthStart, -1))}>
                ‹ {shortMonthOf(addMonths(monthStart, -1))}
              </button>
              <button type="button" style={stepButton} onClick={() => goToMonth(addMonths(monthStart, 1))}>
                {shortMonthOf(addMonths(monthStart, 1))} ›
              </button>
            </nav>
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto', alignItems: 'baseline' }}>
              <span style={coverage}>
                {planned} of {total} slots planned
              </span>
              <Link to={planDayPath(today)} style={todayLink}>
                Today
              </Link>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            Pick a day to plan its meals and see what you'll need.
          </div>
        </header>

        {isError && (
          <StateBlock title="Couldn't load your plans" body="Check your connection and try again." />
        )}

        {!isError && (
          <>
            <MonthGrid monthStart={monthStart} weeks={weeks} byWeek={byWeek} today={today} />
            {isLoading && (
              <div role="status" style={loadingNote}>
                Loading your plans…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '54px 18px 24px',
}

// The month's own ceiling, inside the shell's wide column. The pane can run to
// 1240px, but seven day cells past ~1080 stop gaining anything a planner reads
// — the chips are already legible and the row just gets longer to scan. Capped
// here rather than on .conversation-inner so the scrollbar stays at the pane
// edge and no other wide page is affected.
const MONTH_MAX_WIDTH = 1080

const canvasStyle: CSSProperties = {
  maxWidth: MONTH_MAX_WIDTH,
  margin: '0 auto',
}

const headerStyle: CSSProperties = {
  marginBottom: 18,
}

const stepButton: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 10px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
}

const coverage: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const todayLink: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  textDecoration: 'none',
}

const loadingNote: CSSProperties = {
  marginTop: 12,
  fontSize: 12.5,
  color: 'var(--muted)',
}
