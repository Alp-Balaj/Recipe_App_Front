// ─────────────────────────────────────────────────────────────────────────
// "Plan my week" — the AI proposal flow on the week board (stream C, D2 =
// propose-then-accept).
//
// The whole flow lives in this one component so the board only gains a card:
// trigger → POST /meal-plans/propose-week (read-only on the server) → a review
// dialog where every proposed slot starts checked → accept writes ONLY the
// checked slots, one POST /meal-plans/{id}/entries each, through the same
// lookup-or-create the day page uses (useEnsureWeekPlan).
//
// COLLISIONS RESOLVE HERE, NEVER AS BLIND 409s. The proposal only covers open
// slots, so a 409 on accept means the slot was taken between proposing and
// accepting (another tab, the day page). That slot is reported as skipped and
// every other accepted slot still lands — a race costs one slot, not the batch.
//
// The board's "the only write on this surface is Remove" rule is deliberately
// relaxed by this card (see the page header note): accepting a proposal is
// still planning-by-consent, one entry at a time, not an editor vocabulary.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { ApiConflictError } from '@/api/client'
import {
  addMealPlanEntry,
  proposeWeek,
  type MealPlanEntry,
  type ProposedSlot,
  type WeekProposal,
} from '@/api/mealPlans'
import { useEnsureWeekPlan } from '@/hooks/useMealPlan'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import Modal from '@/components/ui/Modal'

const TOTAL_SLOTS = 21 // 7 days × Breakfast/Lunch/Dinner

/** "Mon" — compact day label for a proposal row. */
function shortDay(day: ProposedSlot['dayOfWeek']): string {
  return day.slice(0, 3)
}

function slotKey(slot: ProposedSlot): string {
  return `${slot.dayOfWeek}-${slot.mealType}`
}

interface ApplyOutcome {
  added: number
  /** Slots that 409'd on accept — taken between proposing and accepting. */
  skipped: number
  /** True when a non-409 failure aborted the batch partway. */
  aborted: boolean
  /** The plan the batch wrote into (resolved by lookup-or-create). */
  planId: string
}

export default function PlanWeekAssistant({
  weekStart,
  entries,
  hidden = false,
}: {
  weekStart: string
  entries: MealPlanEntry[]
  /**
   * Render nothing while staying MOUNTED. The page keeps this component at a
   * stable position across the detail query's loading swap because accepting a
   * proposal on an unplanned week creates the plan, which flips planId and
   * refetches the detail — and an unmount there would throw away the outcome
   * banner the user is owed (caught live: "Added 20 meals" never appeared).
   */
  hidden?: boolean
}) {
  const queryClient = useQueryClient()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const ensurePlan = useEnsureWeekPlan()

  const [proposal, setProposal] = useState<WeekProposal | null>(null)
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null)

  const openSlotCount = TOTAL_SLOTS - entries.length

  const propose = useMutation({
    mutationFn: () => proposeWeek(weekStart),
    onSuccess: (result) => {
      setOutcome(null)
      setProposal(result)
      // Everything starts checked: the common case is "yes, fill my week", and
      // unchecking is the per-slot veto D2 asks for.
      setAccepted(new Set(result.slots.map(slotKey)))
    },
  })

  const apply = useMutation({
    mutationFn: async (slots: ProposedSlot[]): Promise<ApplyOutcome> => {
      // The plan row exists only once something is planned (the day page's
      // rule); lookup-or-create resolves the id and swallows the 409 race.
      const planId = await ensurePlan.mutateAsync(weekStart)

      let added = 0
      let skipped = 0
      let aborted = false
      // Sequential, not Promise.all: 21 parallel writes is a burst the meal
      // rate lane doesn't need, and sequencing gives a clean abort point when
      // the connection dies mid-batch.
      for (const [index, slot] of slots.entries()) {
        try {
          await addMealPlanEntry(planId, {
            dayOfWeek: slot.dayOfWeek,
            mealType: slot.mealType,
            recipeId: slot.recipe.id,
          })
          added += 1
        } catch (error) {
          if (error instanceof ApiConflictError) {
            // Taken since the proposal (another tab, the day page). One slot
            // lost to the race, the rest of the batch still lands.
            skipped += 1
            continue
          }
          // A real failure (network, 5xx): stop rather than hammer a dead
          // connection, and report how far the batch got.
          aborted = true
          skipped += slots.length - index - 1
          break
        }
      }
      return { added, skipped, aborted, planId }
    },
    onSuccess: async (result) => {
      // The entries changed, so every projection over them is stale: the week
      // lookup (a fresh plan may now exist), the detail, the shopping list and
      // the grocery insight. Same rule as useMealPlanMutations.invalidate, plus
      // the mealPlans subtree because the plan itself may have just been created.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.shopping.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.grocery.insight(result.planId) }),
      ])
      setProposal(null)
      setOutcome(result)
    },
  })

  const acceptedSlots = useMemo(
    () => (proposal ? proposal.slots.filter((slot) => accepted.has(slotKey(slot))) : []),
    [proposal, accepted],
  )

  const toggle = (slot: ProposedSlot) => {
    setAccepted((current) => {
      const next = new Set(current)
      const key = slotKey(slot)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const closeReview = () => {
    if (!apply.isPending) setProposal(null)
  }

  if (hidden) return null

  // A full week has nothing to propose into; the card would be a dead button —
  // but it still hosts the outcome banner when the accept is what filled it.
  if (openSlotCount <= 0 && !outcome) return null

  return (
    <div style={cardStyle}>
      <span style={labelStyle}>Plan my week</span>
      {openSlotCount > 0 && (
        <p style={lineStyle}>
          Let the assistant propose meals for your {openSlotCount} open{' '}
          {openSlotCount === 1 ? 'slot' : 'slots'} — nothing is added until you accept.
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {openSlotCount > 0 && (
          <button
            type="button"
            style={proposeButton}
            disabled={propose.isPending}
            onClick={() => propose.mutate()}
          >
            {propose.isPending ? 'Planning your week…' : 'Propose a week'}
          </button>
        )}
        {propose.isError && (
          <span role="status" style={errorText}>
            The assistant couldn't propose a week just now — nothing was changed. Try again.
          </span>
        )}
        {outcome && (
          <span role="status" style={outcome.aborted ? errorText : successText}>
            {outcome.added === 0 && outcome.skipped === 0 && 'Nothing was accepted.'}
            {outcome.added > 0 && `Added ${outcome.added} ${outcome.added === 1 ? 'meal' : 'meals'}.`}
            {outcome.skipped > 0 &&
              ` ${outcome.skipped} ${outcome.skipped === 1 ? 'slot' : 'slots'} couldn't be added${
                outcome.aborted ? ' — connection trouble, the rest were not attempted' : ' — those slots were already taken'
              }.`}
          </span>
        )}
      </div>

      {proposal && (
        <Modal onClose={closeReview} label="Review the proposed week" variant={isDesktop ? 'center' : 'bottom'}>
          <div style={reviewBody}>
            <h2 style={reviewTitle}>The proposed week</h2>
            {proposal.slots.length === 0 ? (
              <p style={lineStyle}>
                The assistant had nothing to propose — there may be no recipes to draw from yet.
              </p>
            ) : (
              <>
                <p style={lineStyle}>
                  Only checked meals are added. Slots you've already planned were never touched.
                </p>
                <ul style={slotList} aria-label="Proposed meals">
                  {proposal.slots.map((slot) => {
                    const key = slotKey(slot)
                    return (
                      <li key={key} style={slotRow}>
                        <label style={slotLabel}>
                          <input
                            type="checkbox"
                            checked={accepted.has(key)}
                            onChange={() => toggle(slot)}
                            disabled={apply.isPending}
                          />
                          <span style={slotWhen}>
                            {shortDay(slot.dayOfWeek)} · {slot.mealType}
                          </span>
                          <span style={slotDish}>
                            {slot.recipe.title}
                            <span style={slotMeta}>
                              {' '}
                              · {slot.recipe.totalTimeMinutes} min
                              {slot.recipe.caloriesPerServing != null &&
                                ` · ${slot.recipe.caloriesPerServing} kcal`}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            <div style={reviewActions}>
              <button type="button" style={ghostButton} disabled={apply.isPending} onClick={closeReview}>
                Cancel
              </button>
              {proposal.slots.length > 0 && (
                <button
                  type="button"
                  style={proposeButton}
                  disabled={apply.isPending || acceptedSlots.length === 0}
                  onClick={() => apply.mutate(acceptedSlots)}
                >
                  {apply.isPending
                    ? 'Adding…'
                    : `Add ${acceptedSlots.length} ${acceptedSlots.length === 1 ? 'meal' : 'meals'}`}
                </button>
              )}
            </div>
            {apply.isError && (
              <p role="status" style={{ ...errorText, margin: 0 }}>
                Couldn't add those meals — check your connection and try again.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--cardsh)',
  borderRadius: 18,
  padding: '11px 13px',
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  marginBottom: 12,
}

const labelStyle: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

const lineStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--muted)',
  lineHeight: 1.4,
}

const proposeButton: CSSProperties = {
  border: 'none',
  borderRadius: 10,
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent-fill)',
  color: 'var(--accent-ink)',
  cursor: 'pointer',
}

const ghostButton: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--muted)',
  cursor: 'pointer',
}

const errorText: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--muted)',
  fontWeight: 600,
}

const successText: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--accent)',
  fontWeight: 700,
}

const reviewBody: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 4,
  minWidth: 0,
}

const reviewTitle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 800,
  letterSpacing: '-0.01em',
}

const slotList: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  maxHeight: '48vh',
  overflowY: 'auto',
}

const slotRow: CSSProperties = {
  borderBottom: '1px solid var(--border)',
}

const slotLabel: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  padding: '7px 2px',
  fontSize: 13.5,
  cursor: 'pointer',
}

const slotWhen: CSSProperties = {
  flex: '0 0 92px',
  fontWeight: 700,
  color: 'var(--muted)',
  fontSize: 12.5,
}

const slotDish: CSSProperties = {
  fontWeight: 600,
  minWidth: 0,
  overflowWrap: 'anywhere',
}

const slotMeta: CSSProperties = {
  fontWeight: 500,
  color: 'var(--muted)',
  fontSize: 12.5,
}

const reviewActions: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 2,
}
