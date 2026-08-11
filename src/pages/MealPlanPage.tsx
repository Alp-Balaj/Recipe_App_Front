// ─────────────────────────────────────────────────────────────────────────
// /plan — the planning front door (plan-page redesign, external handoff).
//
// The month calendar used to BE this page. It is now one feature among several,
// still reachable at ?m=YYYY-MM, and the page answers four questions in order:
//
//   1. What am I cooking next?      — the "Next up" hero
//   2. Can I actually cook it?      — the readiness card (see the pantry note)
//   3. What's coming up?            — the seven-day strip
//   4. How's the week shaped, and how did the last cook go? — §2 and §3
//
// THE PANTRY CARD. Question 2's card is fully built (KitchenReadinessCard) and
// deliberately dark: usePantryReadiness() returns null because no pantry exists
// yet, and another session owns that work. While it is null the top row renders
// a single full-width hero; the moment it returns data the row becomes the
// designed two-column grid and the card appears. Nothing on this page needs to
// change for that — do not "clean up" the null branch.
//
// Below 1024px this renders the month calendar unchanged. The handoff designed
// desktop only, and a half-adapted desktop layout on a phone would be worse
// than the calendar that already works there.
// ─────────────────────────────────────────────────────────────────────────

import { Suspense, useMemo, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { queryKeys } from '@/api/queryKeys'
import { MealPlanMonthPage } from '@/routeChunks'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useCurrentWeekPlan, useEnsureWeekPlan, useMealPlanDetail } from '@/hooks/useMealPlan'
import { useMonthPlans } from '@/hooks/useMonthPlans'
import { useRecipe } from '@/hooks/useRecipe'
import { useSocialEnvelope } from '@/hooks/useSocialEnvelope'
import { useSocialMutations } from '@/hooks/useSocialMutations'
import { useCookHistory, useCookLogMutations, useLatestCook } from '@/hooks/useCookLog'
import { usePantryReadiness } from '@/hooks/usePantryReadiness'
import {
  addMealPlanEntry,
  weekStartOf,
  type MealPlanEntry,
  type MealTypeName,
  type PlannedMealPlanEntry,
} from '@/api/mealPlans'
import {
  addDays,
  formatMonthParam,
  formatPlanDate,
  monthGridWeeks,
  monthStartOf,
  planWeekPath,
  todayPlanDate,
} from '@/lib/planDates'
import { dayLoads } from '@/lib/planInsights'
import {
  formatWeekMinutes,
  nextUp,
  openDinners,
  planDayPathForFirstGap,
  repeatsWithinWeek,
  weekCoverage,
  weekDays,
  weekRangeLongOf,
} from '@/lib/planWeek'
import StateBlock from '@/components/ui/StateBlock'
import PlanSection from '@/components/mealplan/PlanSection'
import NextUpHero from '@/components/mealplan/NextUpHero'
import KitchenReadinessCard from '@/components/mealplan/KitchenReadinessCard'
import WeekStrip from '@/components/mealplan/WeekStrip'
import CookRatingCard from '@/components/mealplan/CookRatingCard'
import CalorieRibbon, { calorieCoverage } from '@/components/mealplan/CalorieRibbon'
import RecipePickerModal from '@/components/mealplan/RecipePickerModal'

export default function MealPlanPage() {
  const [params] = useSearchParams()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // The month calendar keeps its home here, behind ?m= and below 1024px. It is
  // pulled from routeChunks rather than imported directly so it stays in its own
  // chunk — a static `import MealPlanMonthPage from './MealPlanMonthPage'` here
  // would silently fold it into this page's bundle.
  if (params.get('m') !== null || !isDesktop) {
    return (
      <Suspense fallback={<div aria-busy="true" style={{ position: 'absolute', inset: 0 }} />}>
        <MealPlanMonthPage />
      </Suspense>
    )
  }

  return <PlanFrontDoor />
}

function PlanFrontDoor() {
  const navigate = useNavigate()
  const today = useMemo(() => todayPlanDate(), [])
  const weekStartIso = useMemo(() => weekStartOf(today), [today])
  const weekStartDate = useMemo(() => new Date(weekStartIso), [weekStartIso])

  const { planId, isLoading: resolvingPlan, error: planError } = useCurrentWeekPlan(weekStartIso)
  const detail = useMealPlanDetail(planId)

  // THE COLD-START TRAP (MealPlanWeekPage documents it at length): a plan id
  // resolves before its entries do, so between those two requests the page
  // holds an empty entry list that means "not loaded yet", not "nothing
  // planned". Rendering the empty state on that gap tells a user with a full
  // week that they have planned nothing.
  const entries: MealPlanEntry[] = detail.data?.entries ?? []
  const weekPending = resolvingPlan || (planId !== null && detail.isLoading)

  const days = useMemo(() => weekDays(weekStartDate, entries), [weekStartDate, entries])
  const coverage = useMemo(() => weekCoverage(days), [days])
  const repeats = useMemo(() => repeatsWithinWeek(days), [days])
  const gaps = useMemo(() => openDinners(days, today), [days, today])

  // The hero used to derive "already cooked" from useCookHistory()'s first page —
  // 20 rows, newest first. `entries[].cookedAt` (Task 1) is the authoritative,
  // UNPAGINATED source for the exact same fact and is already in hand here, so
  // deriving from it instead can't disagree with the day page the way the
  // 20-row window did for anyone with more recent cooks than that (fix round 3).
  //
  // useCookHistory() itself stays: it shares /plan/cooks' exact query key, so
  // navigating there from here is a cache hit rather than a fresh fetch. Only
  // its DATA stopped being the source of truth for cookedEntryIds.
  useCookHistory()
  const cookedEntryIds = useMemo(() => {
    const ids = new Set<string>()
    for (const entry of entries) {
      if (entry.cookedAt) ids.add(entry.id)
    }
    return ids
  }, [entries])

  const next = useMemo(() => nextUp(days, today, cookedEntryIds), [days, today, cookedEntryIds])

  // `nextUp` skips meals whose recipe is unavailable (KAN-1) — the hero is built entirely
  // out of one and its primary action is "start cooking". But the fallback beneath it says
  // "Nothing planned yet", which is false and visibly contradicted by the coverage strip
  // ("1 / 21 planned") and the week strip's own chip a few rows down. So when the reason
  // there is no hero is that everything left is unavailable, the empty state says THAT.
  const nextIsWithheld = useMemo(() => {
    if (next) return false
    const todayKey = formatPlanDate(today)
    return days.some(
      (day) => day.key >= todayKey && day.entries.some((e) => !e.recipe && !cookedEntryIds.has(e.id)),
    )
  }, [next, days, today, cookedEntryIds])

  // The hero's meta line needs servings and ingredient count, which the entry's
  // recipe summary does not carry. One request, only when there is a hero.
  const nextRecipe = useRecipe(next?.entry.recipe.id)

  // The calorie ribbon is a MONTH-wide reading, so it keeps the month page's
  // data source and derivations rather than inventing a week-shaped variant.
  const monthStart = useMemo(() => monthStartOf(today), [today])
  const monthWeeks = useMemo(() => monthGridWeeks(monthStart), [monthStart])
  const monthWeekStarts = useMemo(() => monthWeeks.map((w) => formatPlanDate(w[0])), [monthWeeks])
  const month = useMonthPlans(monthWeekStarts)
  const loads = useMemo(() => dayLoads(monthWeeks, month.byWeek), [monthWeeks, month.byWeek])
  const calories = useMemo(
    () => calorieCoverage(monthWeeks, monthStart, loads),
    [monthWeeks, monthStart, loads],
  )

  const readiness = usePantryReadiness()
  // Only ever an AVAILABLE entry: the sole setter is the hero's Swap, and `nextUp`
  // never picks an unavailable meal (KAN-1). Stating it in the type is what lets the
  // restore branch in swapEntry below keep the original's recipe id.
  const [swapping, setSwapping] = useState<PlannedMealPlanEntry | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  return (
    <div style={page}>
      <header style={headerBand}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>
            PLAN ·{' '}
            {today
              .toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })
              .toUpperCase()}
          </div>
          <h1 style={title}>{weekRangeLongOf(weekStartDate)}</h1>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={headerCoverage}>
            {coverage.planned} of {coverage.total} planned
          </span>
          <Link to={`/plan?m=${formatMonthParam(monthStart)}`} style={monthLink}>
            Month view ›
          </Link>
        </div>
      </header>

      <div className="scroll" style={body}>
        <div style={column}>
          {planError && (
            <StateBlock
              title="Couldn't load this week"
              body="Check your connection and try again."
            />
          )}

          {message && (
            <div role="alert" style={messageBanner}>
              {message}
            </div>
          )}

          {/* ── Top row. Two columns only when there is a pantry to fill the
              second one; see the header note. ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: readiness
                ? 'minmax(0, 1.55fr) minmax(280px, 1fr)'
                : 'minmax(0, 1fr)',
              gap: 18,
              alignItems: 'stretch',
            }}
          >
            {next ? (
              <NextUpHero
                entry={next.entry}
                whenLabel={next.whenLabel}
                recipe={nextRecipe.data}
                // The plan slot must ride along the same way MealCard's Recipe link
                // carries it (state.planEntryId) — RecipeDetailPage reads it to log
                // the cook against the entry, not just the recipe. Without it, the
                // hero's own "Start cooking" — the app's most prominent cook-mode
                // entry point — finishes into the unlinked path: the entry never
                // shows cooked and the shopping group it feeds never resolves.
                onStartCooking={() =>
                  navigate(`/recipes/${next.entry.recipe.id}?cook=1`, {
                    state: { planEntryId: next.entry.id },
                  })
                }
                onSwap={() => setSwapping(next.entry)}
              />
            ) : weekPending ? (
              <div style={heroPlaceholder} aria-busy="true" />
            ) : nextIsWithheld ? (
              <StateBlock
                title="Your next meal isn't available"
                body="It's still on your plan, but you can no longer open its recipe. Open the day to remove it, or plan something else."
              />
            ) : (
              <StateBlock
                title="Nothing planned yet"
                body="Pick a day on the week below and choose something to cook."
              />
            )}

            {readiness && <KitchenReadinessCard readiness={readiness} />}
          </div>

          {/* ── §1 This week ── */}
          <PlanSection
            index={1}
            title="This week"
            meta={
              coverage.planned > 0
                ? `${formatWeekMinutes(coverage.minutes)} in the kitchen · ${coverage.dishes} ${
                    coverage.dishes === 1 ? 'dish' : 'dishes'
                  }`
                : undefined
            }
            action={
              <Link to={planWeekPath(weekStartDate)} style={sectionLink}>
                Open week ›
              </Link>
            }
          >
            <WeekStrip days={days} todayKey={formatPlanDate(today)} repeats={repeats} />

            <div style={coverageStrip}>
              <span style={coverageFigure}>
                {coverage.planned} / {coverage.total} planned
              </span>
              <span style={coverageSentence}>
                {gaps.days.length === 0
                  ? 'Every dinner this week is planned.'
                  : `${gaps.days.length} ${
                      gaps.days.length === 1 ? 'dinner' : 'dinners'
                    } still open — ${gaps.label}`}
              </span>
              {gaps.days.length > 0 && (
                <Link to={planDayPathForFirstGap(gaps)} style={fillGaps}>
                  Fill the gaps ›
                </Link>
              )}
            </div>
          </PlanSection>

          <div style={bottomRow}>
            {/* ── §2 Planned calories ── */}
            <PlanSection
              index={2}
              title="Planned calories"
              action={
                <span style={denominator}>
                  from {calories.counted} of {calories.planned} planned days
                </span>
              }
            >
              {month.isError ? (
                <StateBlock title="Couldn't load the month" body="Try again in a moment." />
              ) : (
                <CalorieRibbon
                  weeks={monthWeeks}
                  monthStart={monthStart}
                  loads={loads}
                  variant="plan"
                />
              )}
            </PlanSection>

            {/* ── §3 How did it go? ── */}
            <LastCookSection />
          </div>
        </div>
      </div>

      <RecipePickerModal
        open={swapping !== null}
        onClose={() => setSwapping(null)}
        question={swapping ? `Swap ${swapping.recipe.title} for…` : 'Choose a recipe'}
        onPick={(recipeId) => {
          const entry = swapping
          setSwapping(null)
          if (!entry || !planId) return
          setMessage(null)
          // Caught, not floated: an unhandled rejection here would leave the
          // slot silently unchanged with nothing on screen to say so.
          void swapEntry(planId, entry, recipeId, detail.refetch).catch(() =>
            setMessage(`Couldn't swap ${entry.recipe.title}. It's still on the plan.`),
          )
        }}
      />
    </div>
  )
}

/**
 * Replace in place — never remove-then-add.
 *
 * Slots are exclusive, so the POST must follow the DELETE; if the POST fails we
 * put the original back, because losing the meal you already had is the worst
 * possible reading of "swap". Same care MealCard and MealPlanDayPage take.
 */
async function swapEntry(
  planId: string,
  entry: PlannedMealPlanEntry,
  recipeId: string,
  refetch: () => unknown,
) {
  const { removeMealPlanEntry } = await import('@/api/mealPlans')
  await removeMealPlanEntry(planId, entry.id)
  try {
    await addMealPlanEntry(planId, {
      dayOfWeek: entry.dayOfWeek,
      mealType: entry.mealType,
      recipeId,
    })
  } catch (error) {
    await addMealPlanEntry(planId, {
      dayOfWeek: entry.dayOfWeek,
      mealType: entry.mealType,
      recipeId: entry.recipe.id,
    })
    throw error
  } finally {
    refetch()
  }
}

/**
 * §3 — the last cook, its rating and its note.
 *
 * Its own component because it owns three requests of its own and would
 * otherwise re-render the whole page on every keystroke in the note field.
 */
function LastCookSection() {
  const latest = useLatestCook()
  const { saveNote } = useCookLogMutations()
  const { setRating } = useSocialMutations()
  const ensureWeek = useEnsureWeekPlan()
  const queryClient = useQueryClient()
  const cook = latest.data?.latest ?? null

  const envelope = useSocialEnvelope(cook?.recipeId ?? '', undefined, { fetchFallback: true })
  const [repeating, setRepeating] = useState(false)

  return (
    <PlanSection
      index={3}
      title="How did it go?"
      action={
        latest.data && latest.data.totalCount > 0 ? (
          <Link to="/plan/cooks" style={sectionLink}>
            All {latest.data.totalCount} {latest.data.totalCount === 1 ? 'cook' : 'cooks'} ›
          </Link>
        ) : undefined
      }
    >
      {latest.isLoading ? (
        <div style={cardPlaceholder} aria-busy="true" />
      ) : latest.isError ? (
        <StateBlock title="Couldn't load your last cook" body="Try again in a moment." />
      ) : !cook ? (
        <StateBlock
          title="No cooks logged yet"
          body="Finish something in cook mode and it lands here to rate."
        />
      ) : (
        <CookRatingCard
          // Keyed by the cook: the note field seeds its state from the row, so
          // without this a newly-logged cook would inherit the previous one's
          // draft note.
          key={cook.id}
          cook={cook}
          myRating={envelope.myRating ?? null}
          cookAgainPending={repeating}
          onSave={async ({ note, rating }) => {
            // Two independent writes. The note never touches a counter; the
            // rating is the shipped per-recipe one, so /plan and the recipe
            // page cannot end up disagreeing about it.
            await saveNote.mutateAsync({ id: cook.id, note })
            if (rating !== null && rating !== (envelope.myRating ?? null)) {
              await setRating.mutateAsync({ recipeId: cook.recipeId, rating })
            }
          }}
          onCookAgain={async () => {
            setRepeating(true)
            try {
              await repeatOnNextOpenSlot(cook.recipeId, ensureWeek.mutateAsync)
              // Without this the meal is on the plan server-side and invisible
              // here until a reload — the strip, the coverage figures and the
              // hero all read the cached week.
              await queryClient.invalidateQueries({ queryKey: queryKeys.mealPlans.all })
            } finally {
              setRepeating(false)
            }
          }}
        />
      )}
    </PlanSection>
  )
}

/**
 * Put a dish back on the plan, starting tomorrow — MealCard's dumb-repeat
 * semantics: it asks nothing about servings and nothing about which meal.
 *
 * Tomorrow's dinner first, because that is what "cook it again" means to
 * someone reading a plan; if that slot is taken it walks forward to the first
 * free slot in the following week rather than refusing.
 */
async function repeatOnNextOpenSlot(
  recipeId: string,
  ensureWeek: (weekStart: string) => Promise<string>,
) {
  const { getMealPlan } = await import('@/api/mealPlans')
  const start = addDays(todayPlanDate(), 1)
  const MEALS: MealTypeName[] = ['Dinner', 'Lunch', 'Breakfast']

  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(start, offset)
    const weekStart = weekStartOf(date)
    const planId = await ensureWeek(weekStart)
    const plan = await getMealPlan(planId)

    const { dayNameOf } = await import('@/lib/planDates')
    const dayName = dayNameOf(date)
    const taken = new Set(
      plan.entries.filter((e) => e.dayOfWeek === dayName).map((e) => e.mealType),
    )

    const free = MEALS.find((meal) => !taken.has(meal))
    if (free) {
      await addMealPlanEntry(planId, { dayOfWeek: dayName, mealType: free, recipeId })
      return
    }
  }
}

const page: CSSProperties = {
  position: 'absolute',
  inset: 0,
  bottom: 'var(--nav-h, 74px)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerBand: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 20,
  padding: '26px 34px 18px',
  borderBottom: '1px solid var(--border)',
  flexWrap: 'wrap',
  flexShrink: 0,
}

const eyebrow: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 800,
  letterSpacing: '0.11em',
  color: 'var(--muted)',
}

const title: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 32,
  fontWeight: 600,
  letterSpacing: '-0.015em',
  lineHeight: 1.15,
  margin: '4px 0 0',
}

const headerCoverage: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
}

const monthLink: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13.5,
  fontWeight: 800,
  color: 'var(--accent)',
  textDecoration: 'none',
}

const body: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '22px 34px 34px',
}

const column: CSSProperties = {
  maxWidth: 1140,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 26,
}

const messageBanner: CSSProperties = {
  border: '1px solid var(--border)',
  borderLeft: '3px solid var(--clay)',
  background: 'var(--surface)',
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 13,
  color: 'var(--text)',
}

const heroPlaceholder: CSSProperties = {
  minHeight: 300,
  borderRadius: 24,
  background: 'var(--surface2)',
  opacity: 0.5,
}

const cardPlaceholder: CSSProperties = {
  minHeight: 180,
  borderRadius: 18,
  background: 'var(--surface2)',
  opacity: 0.5,
}

const sectionLink: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: 'var(--accent)',
  textDecoration: 'none',
}

const denominator: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--muted)',
  fontVariantNumeric: 'tabular-nums',
}

const coverageStrip: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginTop: 8,
  padding: '10px 14px',
  borderRadius: 12,
  background: 'var(--surface2)',
}

const coverageFigure: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--accent)',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
}

const coverageSentence: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--tagcol)',
}

const fillGaps: CSSProperties = {
  marginLeft: 'auto',
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: '0.04em',
  color: 'var(--accent)',
  flexShrink: 0,
  textDecoration: 'none',
}

const bottomRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
  gap: 18,
  alignItems: 'start',
}
