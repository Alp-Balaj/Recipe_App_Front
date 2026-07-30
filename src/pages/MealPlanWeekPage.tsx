// ─────────────────────────────────────────────────────────────────────────
// The week board (/plan/week/:start) — week/shopping rework, Task 8.
//
// THE WEEK JUDGES, IT DOES NOT EDIT. What used to live here was an editor:
// select-then-place "Move", a generate button, message banners, and a "Start
// this week" cold start — a whole editing vocabulary for a job that turns out
// not to be editing. Editing lives in the month and the day pages. This surface
// answers one question: is this week survivable, and where does it go wrong.
//
// So: DAYS AS ROWS, judgment inline. Seven rows, each carrying its own date, its
// three meals as chips, its effort and its planned calories. The rejected
// alternative was a 7×3 grid with a summary chart underneath, which makes the
// reader eye-match a bar in a footer to a column in a grid; here the evidence and
// the verdict are on the same line. Space is spent in the ranked order of the
// signals — effort first, grocery weight second, calorie rhythm third, dinner
// repetition last and in one line.
//
// Two rules the whole surface obeys:
//  · A PLANNER, NOT A TRACKER. Every calorie figure says "planned". Nothing here
//    knows what was eaten and must never imply it does.
//  · THE CALORIE HONESTY RULE. A day with any planned dish lacking a figure reads
//    "not counted" — not a hole, and not a zero. weekJudgment already returns
//    calories: null for that day; this page renders it as a visible unknown.
//
// NO COLD START. An unplanned week is seven empty rows and nothing to press: a
// plan comes into existence when a MEAL is planned, which is the rule the day
// page already established. The only write on this surface is Remove.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { getGroceryInsight, weekStartOf, type MealPlanEntry } from '@/api/mealPlans'
import { useCurrentWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import { useMealPlanMutations } from '@/hooks/useMealPlanMutations'
import { useDayRecipes } from '@/hooks/useDayRecipes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { addDays, parsePlanDate, planWeekPath, todayPlanDate } from '@/lib/planDates'
import { dinnerRepeats, weekJudgment } from '@/lib/weekJudgment'
import { formatMinutes } from '@/pages/recipeVisuals'
import Modal from '@/components/ui/Modal'
import StateBlock from '@/components/ui/StateBlock'
import MealPanel from '@/components/mealplan/MealPanel'
import WeekDayRow from '@/components/mealplan/WeekDayRow'
import WeekSummary from '@/components/mealplan/WeekSummary'

/** "Mon 27 Jul – Sun 2 Aug" for the week beginning at a UTC-midnight Monday. */
function weekRangeLabel(weekStartIso: string): string {
  const start = new Date(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${fmt(start)} – ${fmt(end)}`
}

export default function MealPlanWeekPage() {
  // Any day in the week is accepted and normalised to its Monday; a missing or
  // malformed segment falls back to this week rather than erroring — a bad week
  // link is not worth a dead end when "this week" is always a valid answer.
  const { start } = useParams<{ start?: string }>()
  const weekStart = weekStartOf(parsePlanDate(start) ?? todayPlanDate())

  const { planId, isLoading, error } = useCurrentWeekPlan(weekStart)
  const detail = useMealPlanDetail(planId)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const entries = useMemo(() => detail.data?.entries ?? [], [detail.data])
  const judgment = useMemo(() => weekJudgment(new Date(weekStart), entries), [weekStart, entries])
  const repeats = useMemo(() => dinnerRepeats(entries), [entries])

  // The insight is a separate request and only exists once a plan does. It is
  // also the one figure on this page the client cannot derive: distinct and
  // shared ingredient counts need every dish's structured ingredients.
  const insight = useQuery({
    queryKey: queryKeys.grocery.insight(planId ?? 'none'),
    queryFn: ({ signal }) => getGroceryInsight(planId!, signal),
    enabled: planId !== null,
  })

  /**
   * The panel's entry is DERIVED from the current entries rather than stored, so
   * a removal (or a week the reader navigated away from) closes it on its own —
   * the panel can never be left describing a meal that no longer exists.
   */
  const selected = entries.find((entry) => entry.id === selectedId) ?? null
  const selectedDay = selected
    ? judgment.days.find((day) => day.dayName === selected.dayOfWeek) ?? null
    : null

  const planned = judgment.days.filter((day) => day.plannedCount > 0)
  const counted = planned.filter((day) => day.isCalorieCounted)
  const maxCalories = counted.reduce((most, day) => Math.max(most, day.calories ?? 0), 0)
  const averageCalories =
    counted.length === 0
      ? 0
      : counted.reduce((sum, day) => sum + (day.calories ?? 0), 0) / counted.length

  const previous = addDays(new Date(weekStart), -7)
  const next = addDays(new Date(weekStart), 7)

  const rows = (
    <ul style={rowList} aria-label="Your week, day by day">
      {judgment.days.map((day) => (
        <WeekDayRow
          key={day.dayName}
          day={day}
          entries={entries.filter((entry) => entry.dayOfWeek === day.dayName)}
          maxMinutes={judgment.heaviestMinutes}
          averageMinutes={judgment.averageMinutes}
          maxCalories={maxCalories}
          averageCalories={averageCalories}
          selectedEntryId={selectedId}
          onSelect={planId ? (entry) => setSelectedId(entry.id) : undefined}
        />
      ))}
    </ul>
  )

  const body = (
    <>
      {isLoading && <StateBlock title="Loading your week…" />}

      {!isLoading && error && (
        <StateBlock title="Couldn't load this week" body="Check your connection and try again." />
      )}

      {!isLoading && !error && (
        <>
          <EffortRead judgment={judgment} counted={counted.length} planned={planned.length} />
          {rows}
          <WeekSummary insight={insight.data} isLoading={insight.isLoading} repeats={repeats} />
        </>
      )}
    </>
  )

  return (
    <div className="scroll" style={pageStyle}>
      <Link to="/plan" style={backLink}>
        ‹ Month
      </Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Your week</h1>
        <nav style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} aria-label="Nearby weeks">
          <Link to={planWeekPath(previous)} style={stepLink}>
            ‹ Prev
          </Link>
          <Link to={planWeekPath(next)} style={stepLink}>
            Next ›
          </Link>
        </nav>
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', margin: '6px 0 16px' }}>
        {weekRangeLabel(weekStart)}
      </div>

      {/* Docked beside the rows on desktop so the week stays judgeable while you
          read one dish; a sheet below that, where there is no room to dock. */}
      {isDesktop ? (
        <div style={splitLayout}>
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>{body}</div>
          {selected && selectedDay && planId && (
            <aside style={panelRail} aria-label="The meal you tapped">
              <MealPanelDock
                planId={planId}
                entry={selected}
                date={selectedDay.date}
                variant="panel"
                onClose={() => setSelectedId(null)}
              />
            </aside>
          )}
        </div>
      ) : (
        <>
          {body}
          {selected && selectedDay && planId && (
            <Modal onClose={() => setSelectedId(null)} label={selected.recipe.title} variant="bottom">
              <MealPanelDock
                planId={planId}
                entry={selected}
                date={selectedDay.date}
                variant="sheet"
                onClose={() => setSelectedId(null)}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The week's effort verdict, stated in words above the rows — the top-ranked
 * signal, and the one thing the bars alone cannot say ("which day is the
 * problem"). An unplanned week says nothing rather than reporting zeros, and
 * offers no way to create anything: there is nothing to start.
 */
function EffortRead({
  judgment,
  counted,
  planned,
}: {
  judgment: ReturnType<typeof weekJudgment>
  counted: number
  planned: number
}) {
  const { heaviestDay, heaviestMinutes, averageMinutes } = judgment

  if (!heaviestDay || planned === 0) {
    return (
      <div style={card}>
        <span style={label}>This week</span>
        <p style={line}>
          Nothing planned yet. Open a day and plan a meal — the week fills itself in from there.
        </p>
      </div>
    )
  }

  const average = Math.round(averageMinutes)
  const ratio = average > 0 ? heaviestMinutes / averageMinutes : 0

  return (
    <div style={card}>
      <span style={label}>Effort</span>
      {/* formatMinutes, not the row's compact "140m": this is prose, and the same
          figure in two forms is easier to read than the same string twice. */}
      <p style={line}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{heaviestDay.dayName}</span> is the
        heaviest day at <span style={figure}>{formatMinutes(heaviestMinutes)}</span>
        {ratio >= 1.4 && <> — {formatRatio(ratio)}× the week&rsquo;s own average</>}
        {ratio < 1.4 && <> against a {formatMinutes(average)} average</>}.
      </p>
      {counted < planned && (
        // The week-level half of the honesty rule: say how much of the calorie
        // read is actually counted, so a run of "not counted" rows is explained
        // rather than looking like a bug.
        <p style={line}>
          Planned calories are counted on {counted} of {planned} planned{' '}
          {planned === 1 ? 'day' : 'days'} — a day with a dish that has no figure stays uncounted.
        </p>
      )}
    </div>
  )
}

/** 2.24 → "2.2", 2.0 → "2". Same rule WeekDayRow uses. */
function formatRatio(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/**
 * The panel plus the two things it needs a real plan id for: the removal, and
 * the dish's full detail (ingredients and difficulty are not on a plan entry's
 * recipe summary). Split out so BOTH only exist while a panel is open — mounting
 * it is what fires the recipe request, and unmounting it cancels the interest.
 */
function MealPanelDock({
  planId,
  entry,
  date,
  variant,
  onClose,
}: {
  planId: string
  entry: MealPlanEntry
  date: Date
  variant: 'panel' | 'sheet'
  onClose: () => void
}) {
  const { removeEntry } = useMealPlanMutations(planId)
  const { byId, isLoading, isError } = useDayRecipes([entry.recipe.id])

  return (
    <MealPanel
      entry={entry}
      date={date}
      recipe={byId.get(entry.recipe.id)}
      isLoading={isLoading}
      isError={isError}
      isRemoving={removeEntry.isPending}
      // No confirm and no banner: the panel closes because its entry stops
      // existing (the page derives it from the entries), which is a clearer
      // report than a message about something that is no longer on screen.
      onRemove={() => removeEntry.mutate(entry.id)}
      onClose={onClose}
      variant={variant}
    />
  )
}

const pageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  // Every row cell is a flex item with a fixed basis that WRAPS, so nothing here
  // ever needs a horizontal scroll — at 375px the two figure cells drop under
  // the chips instead of pushing the page sideways.
  overflowX: 'hidden',
  padding: '54px 18px 24px',
}

const splitLayout: CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
}

// The shell keeps this route in the readable column (AppShell's isWidePage does
// not include /plan/week), so the rail is a share of that column rather than a
// fixed 330px — at 720px a fixed rail would leave the rows too narrow to judge.
const panelRail: CSSProperties = {
  flex: '0 0 clamp(240px, 36%, 340px)',
  minWidth: 0,
  position: 'sticky',
  top: 0,
}

const rowList: CSSProperties = {
  listStyle: 'none',
  margin: '0 0 12px',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const card: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 13px',
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  marginBottom: 12,
}

const label: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const line: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
}

const figure: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '-0.02em',
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const backLink: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  textDecoration: 'none',
}

const stepLink: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
  textDecoration: 'none',
}
