// ─────────────────────────────────────────────────────────────────────────
// One day of the plan (/plan/:date) — meal-plan redesign.
//
// The week board answers "what does my week look like"; this answers "what am
// I cooking today, and what do I need for it". So it carries the things a grid
// cell can't: full-size meal cards, and the ingredients every planned dish
// needs, grouped by dish (see DayIngredients for why grouped and not merged).
//
// Picker PR additions:
//   · No cold start. An unplanned week shows the day anyway, and the first
//     pick creates the plan and adds the meal in one gesture — you never build
//     an empty container before you can put something in it.
//   · The picker docks beside the day on desktop, so the meals and their
//     ingredients stay visible while you choose. Below that it's a sheet.
//   · Placing is instant and reversible: an Undo strip, not a confirm.
//
// Still deliberately out of scope: Swap, fill mode, the month view.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiConflictError } from '@/api/client'
import { queryKeys } from '@/api/queryKeys'
import {
  addMealPlanEntry,
  getMealPlanForWeek,
  removeMealPlanEntry,
  weekStartOf,
  MEAL_ORDER,
  type MealPlanEntry,
  type MealTypeName,
} from '@/api/mealPlans'
import { useCurrentWeekPlan, useEnsureWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import { useDayRecipes } from '@/hooks/useDayRecipes'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { shortDayLabel } from '@/hooks/usePickerCorpus'
import {
  addDays,
  dayHeadingOf,
  dayNameOf,
  isPast,
  isToday,
  parsePlanDate,
  planDayPath,
  shortDayOf,
} from '@/lib/planDates'
import StateBlock from '@/components/ui/StateBlock'
import MealCard from '@/components/mealplan/MealCard'
import DayIngredients, { type IngredientGroup } from '@/components/mealplan/DayIngredients'
import DayTotals, { type DaySlot } from '@/components/mealplan/DayTotals'
import PickerContent from '@/components/mealplan/PickerContent'
import RecipePickerModal from '@/components/mealplan/RecipePickerModal'

/** How long the Undo strip stays after a placement. */
const UNDO_MS = 6000

export default function MealPlanDayPage() {
  const { date } = useParams<{ date: string }>()
  const parsed = parsePlanDate(date)

  if (!parsed) {
    return (
      <StateBlock
        variant="page"
        title="That date doesn't look right"
        body="A day link looks like /plan/2026-07-29. Head back to your plan and pick a day from there."
      />
    )
  }

  return <DayView date={parsed} />
}

interface Placed {
  planId: string
  entryId: string
  title: string
  /** "dinner" / "tomorrow's dinner" — Undo can now reach off this page. */
  where: string
  /**
   * The week the entry landed in, which is NOT always this page's week:
   * repeating a Sunday meal puts it in next week's plan. Undo has to
   * invalidate the week it actually touched.
   */
  weekStart: string
}

function DayView({ date }: { date: Date }) {
  const weekStart = weekStartOf(date)
  const day = dayNameOf(date)
  const past = isPast(date)

  const queryClient = useQueryClient()
  const { planId, isLoading, error } = useCurrentWeekPlan(weekStart)
  const detail = useMealPlanDetail(planId)
  const ensure = useEnsureWeekPlan()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [pickerMeal, setPickerMeal] = useState<MealTypeName | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [placed, setPlaced] = useState<Placed | null>(null)

  const weekEntries = useMemo(() => detail.data?.entries ?? [], [detail.data])
  const entries = useMemo(
    () => weekEntries.filter((entry) => entry.dayOfWeek === day),
    [weekEntries, day],
  )
  const recipeIds = useMemo(() => entries.map((entry) => entry.recipe.id), [entries])
  const { byId, isLoading: detailsLoading, isError: detailsFailed } = useDayRecipes(recipeIds)

  /** recipeId → the days it already sits on this week ("Tue", "Tue, Thu"). */
  const plannedDays = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of weekEntries) {
      const label = shortDayLabel(entry.dayOfWeek)
      const seen = map.get(entry.recipe.id)
      if (!seen) map.set(entry.recipe.id, label)
      else if (!seen.split(', ').includes(label)) map.set(entry.recipe.id, `${seen}, ${label}`)
    }
    return map
  }, [weekEntries])

  const refreshPlan = (id: string, week: string = weekStart) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.week(week) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.detail(id) })
  }

  // Lookup-or-create then add, so an unplanned week costs no extra step. The
  // 409 race on create is already handled inside useEnsureWeekPlan.
  const addToDay = useMutation({
    mutationFn: async (vars: { meal: MealTypeName; recipeId: string }) => {
      const id = planId ?? (await ensure.mutateAsync(weekStart))
      const entry = await addMealPlanEntry(id, {
        dayOfWeek: day,
        mealType: vars.meal,
        recipeId: vars.recipeId,
      })
      return { entry, planId: id }
    },
    onSuccess: ({ entry, planId: id }) => {
      refreshPlan(id)
      setPlaced({
        planId: id,
        entryId: entry.id,
        title: entry.recipe.title,
        where: entry.mealType.toLowerCase(),
        weekStart,
      })
    },
    onError: (err: unknown) =>
      setMessage(err instanceof ApiConflictError ? err.message : "Couldn't add that meal. Try again."),
  })

  // The leftovers gesture: same dish, same slot, one day later. Tomorrow is in
  // NEXT week whenever today is a Sunday, so the target plan is resolved
  // lookup-or-create like any other week rather than assumed to be this one.
  const repeatTomorrow = useMutation({
    mutationFn: async (vars: { meal: MealTypeName; recipeId: string }) => {
      const tomorrow = addDays(date, 1)
      const targetWeek = weekStartOf(tomorrow)
      const id =
        targetWeek === weekStart && planId ? planId : await ensure.mutateAsync(targetWeek)
      const entry = await addMealPlanEntry(id, {
        dayOfWeek: dayNameOf(tomorrow),
        mealType: vars.meal,
        recipeId: vars.recipeId,
      })
      return { entry, planId: id, targetWeek }
    },
    onSuccess: ({ entry, planId: id, targetWeek }) => {
      refreshPlan(id, targetWeek)
      setPlaced({
        planId: id,
        entryId: entry.id,
        title: entry.recipe.title,
        where: `tomorrow's ${entry.mealType.toLowerCase()}`,
        weekStart: targetWeek,
      })
    },
    // A taken slot is the expected failure here, not an error condition — you
    // already planned tomorrow's dinner, and silently replacing it would be the
    // one thing this button must never do.
    onError: (err: unknown, vars) =>
      setMessage(
        err instanceof ApiConflictError
          ? `Tomorrow's ${vars.meal.toLowerCase()} is already planned. Open tomorrow to swap it.`
          : "Couldn't add that to tomorrow. Try again.",
      ),
  })

  const removeFromDay = useMutation({
    mutationFn: (vars: { planId: string; entryId: string; weekStart?: string }) =>
      removeMealPlanEntry(vars.planId, vars.entryId),
    onSuccess: (_result, vars) => refreshPlan(vars.planId, vars.weekStart),
    onError: () => setMessage("Couldn't remove that meal. Try again."),
  })

  // Swap is DELETE-then-POST because slots are exclusive and POST is
  // pure-create (meal-planning-v1-semantics #4). If the POST fails we put the
  // original back — losing the meal you already had would be the worst
  // possible reading of "swap". Same care useMealPlanMutations takes on moves.
  const swapInDay = useMutation({
    mutationFn: async (vars: { planId: string; entry: MealPlanEntry; recipeId: string }) => {
      await removeMealPlanEntry(vars.planId, vars.entry.id)
      try {
        return await addMealPlanEntry(vars.planId, {
          dayOfWeek: vars.entry.dayOfWeek,
          mealType: vars.entry.mealType,
          recipeId: vars.recipeId,
        })
      } catch (error) {
        try {
          await addMealPlanEntry(vars.planId, {
            dayOfWeek: vars.entry.dayOfWeek,
            mealType: vars.entry.mealType,
            recipeId: vars.entry.recipe.id,
          })
        } catch {
          // Nothing further we can do client-side; report the original failure.
        }
        throw error
      }
    },
    onSettled: (_result, _error, vars) => refreshPlan(vars.planId),
    onSuccess: (entry, vars) =>
      setPlaced({
        planId: vars.planId,
        entryId: entry.id,
        title: entry.recipe.title,
        where: entry.mealType.toLowerCase(),
        weekStart,
      }),
    onError: () => setMessage("Couldn't swap that meal. What was there has been kept."),
  })

  // The Undo strip is time-boxed — it's an escape hatch, not a status bar.
  useEffect(() => {
    if (!placed) return
    const timer = setTimeout(() => setPlaced(null), UNDO_MS)
    return () => clearTimeout(timer)
  }, [placed])

  // Stepping to the next day is the main way a week gets planned, so warm what
  // that step needs. Within a week the neighbours share this plan and are
  // already cached; only crossing a Monday or Sunday costs a request, which is
  // exactly when this pays off.
  useEffect(() => {
    for (const neighbour of [addDays(date, -1), addDays(date, 1)]) {
      const neighbourWeek = weekStartOf(neighbour)
      if (neighbourWeek === weekStart) continue
      void queryClient.prefetchQuery({
        queryKey: queryKeys.mealPlans.week(neighbourWeek),
        queryFn: ({ signal }) => getMealPlanForWeek(neighbourWeek, signal),
      })
    }
  }, [date, weekStart, queryClient])

  const entryFor = (meal: MealTypeName): MealPlanEntry | undefined =>
    entries.find((entry) => entry.mealType === meal)

  const openSlots = MEAL_ORDER.filter((meal) => !entryFor(meal)).length

  const daySlots: DaySlot[] = MEAL_ORDER.map((meal) => {
    const entry = entryFor(meal)
    return { meal, entry, recipe: entry ? byId.get(entry.recipe.id) : undefined }
  })

  const groups: IngredientGroup[] = MEAL_ORDER.map((meal) => {
    const entry = entryFor(meal)
    if (!entry) return { meal, title: null, ingredients: [] }
    const recipe = byId.get(entry.recipe.id)
    return {
      meal,
      title: entry.recipe.title,
      ingredients: recipe?.ingredients ?? [],
      unavailable: !recipe && !detailsLoading,
    }
  })

  /** The next slot fill mode would move to, ignoring one just dealt with. */
  const nextOpenAfter = (justFilled: MealTypeName) =>
    MEAL_ORDER.find((meal) => meal !== justFilled && !entryFor(meal))

  const onPick = (recipeId: string) => {
    const meal = pickerMeal
    setMessage(null)
    if (!meal) return

    const occupied = entryFor(meal)
    if (occupied && planId) {
      // Replacing, not filling — so this doesn't advance. You came here to
      // change one thing.
      setPickerMeal(null)
      swapInDay.mutate({ planId, entry: occupied, recipeId })
      return
    }

    addToDay.mutate({ meal, recipeId })
    // Fill mode: the panel stays open and moves to the next empty slot, which
    // the footer already named before the tap — an advance you were told about
    // reads as keeping pace, one sprung on you reads as losing your place.
    setPickerMeal(nextOpenAfter(meal) ?? null)
  }

  const pickerQuestion = pickerMeal
    ? past
      ? `What did you have for ${pickerMeal.toLowerCase()}?`
      : `What's for ${pickerMeal.toLowerCase()}?`
    : ''
  const pickerSubtitle = `${dayHeadingOf(date)} · ${openSlots} ${openSlots === 1 ? 'slot' : 'slots'} open`

  // Named BEFORE the tap, so fill mode's advance is predicted, not sprung.
  const pickerNextHint = pickerMeal
    ? entryFor(pickerMeal)
      ? undefined
      : (() => {
          const next = nextOpenAfter(pickerMeal)
          return next ? `then: ${next.toLowerCase()} →` : `then: ${shortDayOf(addDays(date, 1))} →`
        })()
    : undefined

  /** Normalised names the day already needs, for the picker's row consequence. */
  const alreadyNeeded = useMemo(() => {
    const names = new Set<string>()
    for (const group of groups) {
      for (const ingredient of group.ingredients) {
        const key = ingredient.name.trim().toLowerCase()
        if (key) names.add(key)
      }
    }
    return names
  }, [groups])

  const body = (
    <>
      {isLoading && <StateBlock title="Loading this day…" />}

      {!isLoading && error && (
        <StateBlock title="Couldn't load this day" body="Check your connection and try again." />
      )}

      {!isLoading && !error && (
        <div style={stack}>
          {message && (
            <div role="status" style={messageBanner}>
              {message}
            </div>
          )}

          {placed && (
            <div role="status" style={undoBanner}>
              <span style={{ flex: 1, minWidth: 0 }}>
                Added <strong>{placed.title}</strong> to {placed.where}.
              </span>
              <button
                type="button"
                style={undoButton}
                disabled={removeFromDay.isPending}
                onClick={() => {
                  removeFromDay.mutate({
                    planId: placed.planId,
                    entryId: placed.entryId,
                    weekStart: placed.weekStart,
                  })
                  setPlaced(null)
                }}
              >
                Undo
              </button>
            </div>
          )}

          {detailsFailed && !detailsLoading && (
            <div role="status" style={messageBanner}>
              Some recipe details didn't load, so a few ingredients may be missing below.
            </div>
          )}

          <DayTotals slots={daySlots} isLoading={detailsLoading} />

          <div style={mealStack}>
            {MEAL_ORDER.map((meal) => {
              const entry = entryFor(meal)
              return (
                <MealCard
                  key={meal}
                  meal={meal}
                  entry={entry}
                  recipe={entry ? byId.get(entry.recipe.id) : undefined}
                  detailLoading={detailsLoading}
                  isPast={past}
                  onAdd={
                    entry
                      ? undefined
                      : () => {
                          setMessage(null)
                          setPickerMeal(meal)
                        }
                  }
                  onSwap={
                    entry && planId
                      ? () => {
                          setMessage(null)
                          setPickerMeal(meal)
                        }
                      : undefined
                  }
                  onRemove={
                    entry && planId
                      ? () => {
                          setMessage(null)
                          setPlaced(null)
                          removeFromDay.mutate({ planId, entryId: entry.id })
                        }
                      : undefined
                  }
                  // A past day is a record of what you ate, so it doesn't offer
                  // to repeat itself — same rule the empty slots already follow.
                  onRepeatTomorrow={
                    entry && !past
                      ? () => {
                          setMessage(null)
                          repeatTomorrow.mutate({ meal, recipeId: entry.recipe.id })
                        }
                      : undefined
                  }
                />
              )
            })}
          </div>

          <DayIngredients groups={groups} isLoading={detailsLoading} />
        </div>
      )}
    </>
  )

  return (
    <div className="scroll" style={pageStyle}>
      <DayHeader date={date} />

      {isDesktop ? (
        <div style={splitLayout}>
          <div style={{ flex: '1 1 auto', minWidth: 0, maxWidth: 760 }}>{body}</div>
          {pickerMeal && (
            <aside style={pickerRail} aria-label="Choose a recipe">
              <PickerContent
                variant="panel"
                question={pickerQuestion}
                subtitle={pickerSubtitle}
                plannedDays={plannedDays}
                alreadyNeeded={alreadyNeeded}
                nextHint={pickerNextHint}
                onPick={onPick}
                onClose={() => setPickerMeal(null)}
              />
            </aside>
          )}
        </div>
      ) : (
        <>
          {body}
          <RecipePickerModal
            open={pickerMeal !== null}
            question={pickerQuestion}
            subtitle={pickerSubtitle}
            plannedDays={plannedDays}
            alreadyNeeded={alreadyNeeded}
            nextHint={pickerNextHint}
            onClose={() => setPickerMeal(null)}
            onPick={onPick}
          />
        </>
      )}
    </div>
  )
}

/** Back link, the day itself, and a step to either neighbour. */
function DayHeader({ date }: { date: Date }) {
  const previous = addDays(date, -1)
  const next = addDays(date, 1)

  return (
    <header style={{ marginBottom: 18 }}>
      <Link to="/plan" style={backLink}>
        ‹ Plan
      </Link>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
          {dayHeadingOf(date)}
        </h1>
        {isToday(date) && <span style={todayChip}>Today</span>}
        <nav style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} aria-label="Nearby days">
          <Link to={planDayPath(previous)} style={stepLink}>
            ‹ {shortDayOf(previous)}
          </Link>
          <Link to={planDayPath(next)} style={stepLink}>
            {shortDayOf(next)} ›
          </Link>
        </nav>
      </div>
    </header>
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

const splitLayout: CSSProperties = {
  display: 'flex',
  gap: 18,
  alignItems: 'flex-start',
}

// The shell gives this page the wide desktop column (AppShell's isWidePage), so
// the rail can hold a recipe row without crushing it. It still shrinks back to
// its old 330px on a 1024px screen, where the meals need that space more.
const pickerRail: CSSProperties = {
  flex: '0 0 clamp(330px, 34%, 420px)',
  minWidth: 0,
}

const stack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  maxWidth: 760,
}

const mealStack: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
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

const todayChip: CSSProperties = {
  background: 'var(--chipbg)',
  color: 'var(--chipcol)',
  borderRadius: 999,
  padding: '3px 10px',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const messageBanner: CSSProperties = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--muted)',
}

const undoBanner: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  background: 'var(--chipbg)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: '10px 12px',
  fontSize: 13,
  overflowWrap: 'anywhere',
}

const undoButton: CSSProperties = {
  flexShrink: 0,
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '5px 11px',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700,
  background: 'var(--surface)',
  color: 'var(--text)',
}
