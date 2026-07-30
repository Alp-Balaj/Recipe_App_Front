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
// page already established.
//
// WRITES (amended by stream C, AI meal-plan generation): Remove, plus accepting
// slots from an AI-proposed week (PlanWeekAssistant). The proposal is
// deliberately NOT the old editor vocabulary this header banished — the server
// writes nothing when proposing, only open slots are ever proposed, and each
// accepted slot goes through the same POST the day page uses. Judgment stays
// the surface's job; the assistant just fills the empty rows being judged.
// ─────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
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
import Modal from '@/components/ui/Modal'
import StateBlock from '@/components/ui/StateBlock'
import MealPanel from '@/components/mealplan/MealPanel'
import PlanWeekAssistant from '@/components/mealplan/PlanWeekAssistant'
import WeekDayRow from '@/components/mealplan/WeekDayRow'
import WeekSummary from '@/components/mealplan/WeekSummary'

/**
 * The panel's element id. One constant rather than a generated one because there
 * is only ever ONE panel open on this surface, and the chips need to name it in
 * `aria-controls` before they know which variant will render it.
 */
const PANEL_ID = 'week-meal-panel'

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
  const closePanel = useCallback(() => setSelectedId(null), [])
  // Focus has to land somewhere real when the panel closes. Both containers try
  // the chip that opened it first (Modal does its own restore; DesktopDock does
  // the same), but after a successful REMOVE that chip has been unmounted and
  // focus falls to <body> — from where a keyboard reader has to start the page
  // again. The board heading is the meaningful fallback.
  const headingRef = useRef<HTMLHeadingElement>(null)

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

  // Closing the panel must not drop focus on the floor. Both containers restore
  // to the chip first; this catches the case where that chip no longer exists.
  const wasOpen = useRef(false)
  useEffect(() => {
    const open = selected !== null
    if (wasOpen.current && !open && document.activeElement === document.body) {
      headingRef.current?.focus()
    }
    wasOpen.current = open
  }, [selected])

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
          panelId={PANEL_ID}
          onSelect={planId ? (entry) => setSelectedId(entry.id) : undefined}
        />
      ))}
    </ul>
  )

  // The week resolves in TWO requests, and the second one has its own states.
  // Without them a planned week showed the cold-start copy and seven empty rows
  // for the whole detail round trip — and PERMANENTLY if that request failed,
  // which told the reader their plan was empty when it was not. Cold start now
  // means exactly one thing: this week genuinely has no plan.
  const body = (
    <>
      {isLoading && <StateBlock title="Loading your week…" />}

      {!isLoading && error && (
        <StateBlock title="Couldn't load this week" body="Check your connection and try again." />
      )}

      {!isLoading && !error && detail.isLoading && <StateBlock title="Loading this week's meals…" />}

      {!isLoading && !error && !detail.isLoading && detail.error && (
        <StateBlock
          title="Couldn't load this week's meals"
          body="Your plan is still there — check your connection and try again."
        />
      )}

      {!isLoading && !error && !detail.isLoading && !detail.error && (
        <WeekNote counted={counted.length} planned={planned.length} />
      )}
      {/* MOUNTED (not conditionally rendered) across the detail swap: accepting
          a proposal on an unplanned week creates the plan, which flips planId
          and puts the detail query back into isLoading — and unmounting the
          assistant there would throw away the outcome it is about to report.
          It hides itself via `hidden` instead, which preserves its state. */}
      {!isLoading && !error && (
        <PlanWeekAssistant
          weekStart={weekStart}
          entries={entries}
          hidden={detail.isLoading || Boolean(detail.error)}
        />
      )}
      {!isLoading && !error && !detail.isLoading && !detail.error && (
        <>
          {rows}
          <WeekSummary
            insight={insight.data}
            isLoading={insight.isLoading}
            repeats={repeats}
            hasPlan={planId !== null}
          />
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
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0, outline: 'none' }}
        >
          Your week
        </h1>
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
            <DesktopDock onClose={closePanel}>
              <MealPanelDock
                planId={planId}
                entry={selected}
                date={selectedDay.date}
                onClose={closePanel}
              />
            </DesktopDock>
          )}
        </div>
      ) : (
        <>
          {body}
          {selected && selectedDay && planId && (
            <Modal onClose={closePanel} label={selected.recipe.title} variant="bottom">
              <MealPanelDock
                planId={planId}
                entry={selected}
                date={selectedDay.date}
                onClose={closePanel}
              />
            </Modal>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The one week-level line that isn't already on a row: how much of the calorie
 * read is actually counted. Everything else the rows say for themselves — the
 * heaviest day's own row already carries "2.2× average", and repeating that as
 * prose here was the same judgment stated twice.
 *
 * A week with nothing planned says so and offers no way to create anything:
 * there is nothing to start. A fully-counted week renders nothing at all — no
 * news is not a card.
 */
function WeekNote({ counted, planned }: { counted: number; planned: number }) {
  if (planned === 0) {
    return (
      <div style={card}>
        <span style={label}>This week</span>
        <p style={line}>
          Nothing planned yet. Open a day and plan a meal — the week fills itself in from there.
        </p>
      </div>
    )
  }

  if (counted === planned) return null

  return (
    <div style={card}>
      <span style={label}>Planned calories</span>
      <p style={line}>
        Counted on {counted} of {planned} planned {planned === 1 ? 'day' : 'days'} — a day with a
        dish that has no figure stays uncounted.
      </p>
    </div>
  )
}

/**
 * The docked container on desktop. It exists as its own component so its
 * keyboard contract can be mount-scoped: focus moves in when it opens, Escape
 * closes it, and focus returns to the chip that opened it — the same contract
 * Modal gives the sheet, which this branch deliberately does not use (a dialog
 * would dim the week, and the week staying readable is the whole point of
 * docking). It sits last in DOM order, after the rows and the footer, so moving
 * focus in is not a nicety: without it the dock is ~20 tab stops away.
 */
function DesktopDock({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  // Captured during render, not in the effect: by effect time the active element
  // could already be inside the dock. Same reasoning as Modal's own capture.
  const [trigger] = useState(() => document.activeElement as HTMLElement | null)

  useEffect(() => {
    ref.current?.focus()
    return () => {
      // isConnected, because a successful remove unmounts the chip we came from;
      // the page's heading fallback picks that case up.
      if (trigger?.isConnected) trigger.focus()
    }
  }, [trigger])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      style={panelRail}
      aria-label="The meal you tapped"
    >
      {children}
    </aside>
  )
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
  onClose,
}: {
  planId: string
  entry: MealPlanEntry
  date: Date
  onClose: () => void
}) {
  const { removeEntry } = useMealPlanMutations(planId)
  const { byId, isLoading, isError } = useDayRecipes([entry.recipe.id])

  return (
    <MealPanel
      entry={entry}
      date={date}
      id={PANEL_ID}
      recipe={byId.get(entry.recipe.id)}
      isLoading={isLoading}
      isError={isError}
      isRemoving={removeEntry.isPending}
      // A SUCCESS needs no message: the panel closes because its entry stops
      // existing (the page derives it from the entries), which reports itself.
      // A FAILURE has no such tell — nothing left the list, so the tap looks
      // like it did nothing at all — and it says so inside the panel rather
      // than in a page-level banner, which is the editor vocabulary this
      // surface deliberately drops.
      removeFailed={removeEntry.isError}
      onRemove={() => removeEntry.mutate(entry.id)}
      onClose={onClose}
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
  // The ONE sticky on this pair: MealPanel had a second one for the same job,
  // and two nested stickies only ever fight each other.
  position: 'sticky',
  top: 0,
  outline: 'none',
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
