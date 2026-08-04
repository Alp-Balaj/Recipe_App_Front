// Stream G, slice G3. What these pin is D8's shape on the authoring surface:
// the picker SUGGESTS from the catalogue and never constrains what can be typed.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { server } from '@/test/msw/server'
import { IngredientPicker } from './IngredientPicker'

function makeIngredient(over: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Wheat flour',
    category: 'Grains & pasta',
    gramsPerMillilitre: 0.5708,
    gramsPerPiece: null,
    kcal: 364,
    proteinG: 10.3,
    fatG: 1,
    carbsG: 76.3,
    fibreG: 2.7,
    fdcId: 169761,
    ...over,
  }
}

/** Minimal RHF host, mirroring how RecipeFormPage.shared registers the field. */
function Host({ value = '' }: { value?: string }) {
  const { register, watch } = useForm({ defaultValues: { name: value } })
  return (
    <IngredientPicker
      label="Name"
      aria-label="Ingredient 1 name"
      registration={register('name')}
      value={watch('name')}
    />
  )
}

describe('IngredientPicker', () => {
  it('offers catalogue suggestions for what is typed', async () => {
    server.use(
      http.get('*/ingredients', () =>
        HttpResponse.json({ items: [makeIngredient(), makeIngredient({ id: '2', name: 'Almond flour' })], total: 1500 })),
    )

    render(<Host />)
    await userEvent.type(screen.getByLabelText('Ingredient 1 name'), 'flour')

    // A <datalist>, not a <select>: it suggests, it does not constrain. Queried
    // through the DOM rather than by role — jsdom does not give datalist options
    // an accessible name to match on.
    await waitFor(
      () =>
        expect(
          Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value')),
        ).toEqual(['Wheat flour', 'Almond flour']),
      { timeout: 2000 },
    )
  })

  it('reports a catalogue match', async () => {
    server.use(
      http.get('*/ingredients', () => HttpResponse.json({ items: [makeIngredient()], total: 1500 })),
    )

    render(<Host />)
    await userEvent.type(screen.getByLabelText('Ingredient 1 name'), 'Wheat flour')

    expect(await screen.findByText('Matched Wheat flour', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('says an unknown ingredient still saves, and does not call it an error', async () => {
    // D8 on the authoring surface. The wording matters as much as the state:
    // an unresolved ingredient is a legal, permanent outcome, not a failure.
    server.use(http.get('*/ingredients', () => HttpResponse.json({ items: [], total: 1500 })))

    render(<Host />)
    await userEvent.type(screen.getByLabelText('Ingredient 1 name'), 'gochujang')

    expect(await screen.findByText(/saves as typed/i, {}, { timeout: 2000 })).toBeInTheDocument()
    // The typed value is untouched — the picker never rewrites what was entered.
    expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('gochujang')
  })

  it('keeps accepting input when the catalogue lookup fails', async () => {
    // The old field's guarantee, preserved: a failed suggestion lookup must
    // never block typing a brand-new ingredient.
    server.use(http.get('*/ingredients', () => HttpResponse.error()))

    render(<Host />)
    const input = screen.getByLabelText('Ingredient 1 name')
    await userEvent.type(input, 'gochujang')

    expect(input).toHaveValue('gochujang')
  })
})
