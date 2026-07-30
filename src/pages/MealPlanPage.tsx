// ─────────────────────────────────────────────────────────────────────────
// Weekly meal-plan surface (/plan) — meal-planning-ui plan, Task 4 shell.
//
// Header, resolved week label, and either the "Start this week" call to action
// (the week has no plan yet) or the WeekGrid for the resolved plan. No nav
// entry links here until Task 9.
//
// Task 6 wires the writes. Tapping an empty slot opens the recipe picker and
// adds; a filled slot carries Move / × affordances. Move is select-then-place
// (no drag-and-drop library may be added): "Move" arms the entry, the next tap
// on an EMPTY slot places it. The two-call DELETE-then-POST and its restore on
// failure live in useMealPlanMutations — this page only decides what a tap
// means and shows the resulting message.
//
// "Generate shopping list" is GONE (week/shopping rework, Tasks 4–5): the list is
// a per-request projection of this week's plan now, so there is nothing to
// generate and nothing to regenerate — the week's meals ARE the list, and a tick
// survives every later edit. The button and its lost-ticks confirmation went with
// the endpoint; "View list" stays. This whole page is replaced by the days-as-rows
// board in Task 8 of the same plan.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiConflictError } from '@/api/client'
import { weekStartOf, type DayName, type MealPlanEntry, type MealTypeName } from '@/api/mealPlans'
import { useCurrentWeekPlan, useEnsureWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import { useMealPlanMutations } from '@/hooks/useMealPlanMutations'
import { shortDayLabel } from '@/hooks/usePickerCorpus'
import { addDays, parsePlanDate, planWeekPath, todayPlanDate } from '@/lib/planDates'
import StateBlock from '@/components/ui/StateBlock'
import WeekGrid from '@/components/mealplan/WeekGrid'
import RecipePickerModal from '@/components/mealplan/RecipePickerModal'

const pageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  overflowY: 'auto',
  // Task 9 responsive parity: the page never scrolls sideways at any width —
  // the week grid owns its own horizontal scroll (see WeekGrid's scrollFrame).
  overflowX: 'hidden',
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
  // The week now comes from the URL (/plan/week/:start), which is what finally
  // makes this surface able to show a week other than the current one. Any day
  // in the week is accepted and normalised to its Monday; a missing or
  // malformed segment falls back to this week rather than erroring.
  const { start } = useParams<{ start?: string }>()
  const weekStart = weekStartOf(parsePlanDate(start) ?? todayPlanDate())

  const { planId, isLoading, error } = useCurrentWeekPlan(weekStart)
  const ensure = useEnsureWeekPlan()
  const detail = useMealPlanDetail(planId)

  const previous = addDays(new Date(weekStart), -7)
  const next = addDays(new Date(weekStart), 7)

  return (
    <div className="scroll" style={pageStyle}>
      <Link to="/plan" style={backLink}>
        ‹ Month
      </Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>Meal plan</h1>
        <nav style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} aria-label="Nearby weeks">
          <Link to={planWeekPath(previous)} style={stepLink}>
            ‹ Prev
          </Link>
          <Link to={planWeekPath(next)} style={stepLink}>
            Next ›
          </Link>
        </nav>
      </div>
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
          {!detail.isLoading && !detail.error && (
            <PlanWeek planId={planId} entries={detail.data?.entries ?? []} weekStart={weekStart} />
          )}
        </>
      )}
    </div>
  )
}

/**
 * The writable week. Split out because the mutation hook needs a real plan id —
 * the parent only has one once the week has resolved.
 */
function PlanWeek({
  planId,
  entries,
  weekStart,
}: {
  planId: string
  entries: MealPlanEntry[]
  weekStart: string
}) {
  const { addEntry, removeEntry, moveEntry } = useMealPlanMutations(planId)
  const [pickerSlot, setPickerSlot] = useState<{ day: DayName; meal: MealTypeName } | null>(null)
  const [moving, setMoving] = useState<MealPlanEntry | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const entryAt = (day: DayName, meal: MealTypeName) =>
    entries.find((e) => e.dayOfWeek === day && e.mealType === meal)

  /** recipeId → the days it already sits on, so the picker can warn about repeats. */
  const plannedDays = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of entries) {
      const label = shortDayLabel(entry.dayOfWeek)
      const seen = map.get(entry.recipe.id)
      if (!seen) map.set(entry.recipe.id, label)
      else if (!seen.split(', ').includes(label)) map.set(entry.recipe.id, `${seen}, ${label}`)
    }
    return map
  }, [entries])

  const report = (fallback: string) => (err: unknown) =>
    setMessage(err instanceof ApiConflictError ? err.message : fallback)

  const onSlotClick = (day: DayName, meal: MealTypeName) => {
    setMessage(null)
    const occupied = entryAt(day, meal)

    if (moving) {
      // Placing. Slots are exclusive, so only an empty one can receive a move.
      if (occupied) {
        setMessage(
          occupied.id === moving.id
            ? 'That meal is already in this slot.'
            : 'That slot is taken — pick an empty one, or remove what is there first.',
        )
        return
      }
      const entry = moving
      setMoving(null)
      moveEntry
        .mutateAsync({ entry, toDay: day, toMeal: meal })
        .catch(report("Couldn't move that meal. It has been put back where it was."))
      return
    }

    // A filled slot's own buttons (Move / ×) carry its actions; a bare tap on
    // one does nothing. An empty slot opens the picker.
    if (!occupied) setPickerSlot({ day, meal })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <Link to="/shopping-list" style={listLink}>
          View list
        </Link>
      </div>

      {moving && (
        <div style={movingBanner}>
          <span style={{ flex: 1, minWidth: 0 }}>
            Moving <strong>{moving.recipe.title}</strong> — tap an empty slot.
          </span>
          <button type="button" style={bannerButton} onClick={() => setMoving(null)}>
            Cancel
          </button>
        </div>
      )}

      {message && (
        <div role="status" style={messageBanner}>
          {message}
        </div>
      )}

      <WeekGrid
        entries={entries}
        weekStart={weekStart}
        onSlotClick={onSlotClick}
        onRemove={(entryId) => {
          setMessage(null)
          if (moving?.id === entryId) setMoving(null)
          removeEntry.mutateAsync(entryId).catch(report("Couldn't remove that meal. Try again."))
        }}
        onMove={(entry) => {
          setMessage(null)
          setMoving((current) => (current?.id === entry.id ? null : entry))
        }}
        movingEntryId={moving?.id ?? null}
      />

      <RecipePickerModal
        open={pickerSlot !== null}
        question={pickerSlot ? `What's for ${pickerSlot.meal.toLowerCase()} on ${pickerSlot.day}?` : 'Choose a recipe'}
        plannedDays={plannedDays}
        onClose={() => setPickerSlot(null)}
        onPick={(recipeId) => {
          const slot = pickerSlot
          setPickerSlot(null)
          if (!slot) return
          addEntry
            .mutateAsync({ dayOfWeek: slot.day, mealType: slot.meal, recipeId })
            .catch(report("Couldn't add that meal. Try again."))
        }}
      />
    </>
  )
}

const movingBanner: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  marginBottom: 12,
  overflowWrap: 'anywhere',
}

const messageBanner: React.CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--muted)',
  marginBottom: 12,
}

const backLink: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--accent)',
  textDecoration: 'none',
}

const stepLink: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 10px',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  background: 'var(--surface)',
  textDecoration: 'none',
}

const listLink: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--muted)',
  textDecoration: 'none',
}

const bannerButton: React.CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface)',
}
