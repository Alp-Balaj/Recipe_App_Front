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
// Task 8 adds "Generate shopping list" (enabled only once the week has an
// entry). Regenerating REPLACES this plan's generated rows, so ticks on them
// are discarded (meal-planning-v1-semantics #5) — the confirm says so plainly
// before anything is called, and success invalidates the shopping-list subtree.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiConflictError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import { generateShoppingList, weekStartOf, type DayName, type MealPlanEntry, type MealTypeName } from '@/api/mealPlans'
import { useCurrentWeekPlan, useEnsureWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import { useMealPlanMutations } from '@/hooks/useMealPlanMutations'
import StateBlock from '@/components/ui/StateBlock'
import Modal from '@/components/ui/Modal'
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
          {!detail.isLoading && !detail.error && (
            <PlanWeek planId={planId} entries={detail.data?.entries ?? []} />
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
function PlanWeek({ planId, entries }: { planId: string; entries: MealPlanEntry[] }) {
  const { addEntry, removeEntry, moveEntry } = useMealPlanMutations(planId)
  const [pickerSlot, setPickerSlot] = useState<{ day: DayName; meal: MealTypeName } | null>(null)
  const [moving, setMoving] = useState<MealPlanEntry | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmingGenerate, setConfirmingGenerate] = useState(false)

  const queryClient = useQueryClient()
  const generate = useMutation({
    mutationFn: () => generateShoppingList(planId),
    onSuccess: () => {
      setConfirmingGenerate(false)
      setMessage('Shopping list updated from this week.')
      void queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all })
    },
    onError: () => {
      setConfirmingGenerate(false)
      setMessage("Couldn't generate the shopping list. Try again.")
    },
  })

  const entryAt = (day: DayName, meal: MealTypeName) =>
    entries.find((e) => e.dayOfWeek === day && e.mealType === meal)

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
        <button
          type="button"
          style={{ ...generateButton, opacity: entries.length === 0 || generate.isPending ? 0.5 : 1 }}
          disabled={entries.length === 0 || generate.isPending}
          onClick={() => {
            setMessage(null)
            setConfirmingGenerate(true)
          }}
        >
          {generate.isPending ? 'Generating…' : 'Generate shopping list'}
        </button>
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

      {confirmingGenerate && (
        <Modal onClose={() => setConfirmingGenerate(false)} label="Regenerate this week's shopping list?">
          <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Regenerate this week's shopping list?</div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Items generated from this plan will be replaced, and anything you'd already ticked off on them will be
              unticked. Items you added yourself are not affected.
            </div>
            <div style={warningNote}>Purchased ticks on generated items are not kept.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
              <button type="button" style={bannerButton} onClick={() => setConfirmingGenerate(false)}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...generateButton, opacity: generate.isPending ? 0.6 : 1 }}
                disabled={generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
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

const generateButton: React.CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: 'none',
  borderRadius: 12,
  padding: '9px 14px',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent)',
  color: 'var(--accent-ink)',
}

const listLink: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--muted)',
  textDecoration: 'none',
}

const warningNote: React.CSSProperties = {
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '8px 10px',
  fontSize: 12.5,
  fontWeight: 600,
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
