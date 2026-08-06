import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DayNutritionRibbon from './DayNutritionRibbon'
import * as api from '@/api/planNutrition'
import type { DayNutrition, MealPlanNutrition } from '@/api/planNutrition'

// The ribbon is a leaf: one read, one day picked out of it. Rendered directly
// rather than through the route so each coverage case is one assertion away.

function renderRibbon(props: { planId?: string | null; day?: DayNutrition['dayOfWeek']; plannedMeals?: number } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <DayNutritionRibbon
        planId={props.planId === undefined ? 'plan-1' : props.planId}
        day={props.day ?? 'Wednesday'}
        plannedMeals={props.plannedMeals ?? 2}
      />
    </QueryClientProvider>,
  )
}

function day(over: Partial<DayNutrition> = {}): DayNutrition {
  return {
    dayOfWeek: 'Wednesday',
    entryCount: 2,
    kcal: 1840,
    proteinG: 92.4,
    fatG: 61.1,
    carbsG: 210.5,
    fibreG: 24.2,
    coveredLines: 11,
    totalLines: 11,
    isSufficientlyCovered: true,
    ...over,
  }
}

function stub(days: DayNutrition[]) {
  const payload: MealPlanNutrition = { mealPlanId: 'plan-1', days }
  return vi.spyOn(api, 'getMealPlanNutrition').mockResolvedValue(payload)
}

describe('the day nutrition ribbon', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows the computed calories and macros for the day it was asked for', async () => {
    stub([day(), day({ dayOfWeek: 'Thursday', kcal: 900 })])

    renderRibbon()

    expect(await screen.findByText('1,840')).toBeInTheDocument()
    expect(screen.getByText(/protein 92.4 g/i)).toBeInTheDocument()
    expect(screen.getByText(/carbs 210.5 g/i)).toBeInTheDocument()
    // Thursday's figure belongs to Thursday's page.
    expect(screen.queryByText('900')).not.toBeInTheDocument()
  })

  it('labels the figure as computed rather than presenting it as the recipe calories', async () => {
    // The typed figure stays the day page's headline; this one says where it
    // came from. Two answers to two questions, never one overwriting the other.
    stub([day()])

    renderRibbon()

    expect(await screen.findByLabelText(/computed nutrition for this day/i)).toBeInTheDocument()
    expect(screen.getByText(/from the ingredients/i)).toBeInTheDocument()
  })

  it('carries its coverage with every figure', async () => {
    stub([day({ coveredLines: 9, totalLines: 11 })])

    renderRibbon()

    expect(await screen.findByText('9 of 11 lines')).toBeInTheDocument()
    expect(
      screen.getByText(/computed from 9 of 11 ingredient lines across 2 meals, one serving each/i),
    ).toBeInTheDocument()
  })

  it('says so when every line was counted', async () => {
    stub([day({ coveredLines: 11, totalLines: 11 })])

    renderRibbon()

    expect(await screen.findByText(/computed from all 11 ingredient lines/i)).toBeInTheDocument()
  })

  // ── D12's floor ────────────────────────────────────────────────────────────

  it('renders a thinly covered day as incomplete rather than as a number', async () => {
    // The rule that makes the whole ribbon safe: an undercounted total does not
    // look uncertain, it looks like a light day.
    stub([day({ kcal: 420, coveredLines: 3, totalLines: 11, isSufficientlyCovered: false })])

    renderRibbon()

    expect(await screen.findByText(/too few to total the day honestly/i)).toBeInTheDocument()
    expect(screen.queryByText('420')).not.toBeInTheDocument()
    // ...and it points at the figures that ARE trustworthy.
    expect(screen.getByText(/what the recipe authors typed/i)).toBeInTheDocument()
  })

  it('says plainly when nothing resolved at all', async () => {
    stub([day({ kcal: null, proteinG: null, fatG: null, carbsG: null, fibreG: null, coveredLines: 0, totalLines: 7, isSufficientlyCovered: false })])

    renderRibbon()

    expect(
      await screen.findByText(/none of today's ingredients are in the catalogue/i),
    ).toBeInTheDocument()
  })

  // ── silence ────────────────────────────────────────────────────────────────

  it('renders nothing for a day with no meals planned', async () => {
    const fetcher = stub([day()])

    const { container } = renderRibbon({ plannedMeals: 0 })

    await waitFor(() => expect(container).toBeEmptyDOMElement())
    // ...and does not spend a request finding that out.
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('renders nothing before the week has a plan at all', async () => {
    const fetcher = stub([day()])

    const { container } = renderRibbon({ planId: null })

    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('renders nothing when the day is not in the response', async () => {
    stub([day({ dayOfWeek: 'Monday' })])

    const { container } = renderRibbon({ day: 'Wednesday' })

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('stays silent when the read fails — it is nobody\'s critical path', async () => {
    vi.spyOn(api, 'getMealPlanNutrition').mockRejectedValue(new Error('nope'))

    const { container } = renderRibbon()

    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('asks for the whole plan once rather than once per meal', async () => {
    // The reason the endpoint is batched at all.
    const fetcher = stub([day()])

    renderRibbon({ plannedMeals: 3 })

    await screen.findByText('1,840')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('plan-1', expect.anything())
  })
})
