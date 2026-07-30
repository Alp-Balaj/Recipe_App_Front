import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useForm } from 'react-hook-form'
import { server } from '@/test/msw/server'
import { IngredientNameField } from './IngredientNameField'

// Real timers throughout (see IngredientNameField.tsx header on this test file's
// approach): vitest 4's fake timers + @testing-library/user-event's own internal
// scheduling hang indefinitely together (confirmed by a minimal repro outside
// this component — unrelated to the field itself). debounceMs is instead an
// overridable prop, defaulting to 300ms in production; tests use a small real
// value and assert on real elapsed time.
const TEST_DEBOUNCE_MS = 40

function Harness() {
  const { register } = useForm<{ name: string }>({ defaultValues: { name: '' } })
  return (
    <IngredientNameField
      label="Name"
      aria-label="Ingredient name"
      registration={register('name')}
      debounceMs={TEST_DEBOUNCE_MS}
    />
  )
}

describe('IngredientNameField', () => {
  it('debounces the query — typing does not fire a request per keystroke', async () => {
    const user = userEvent.setup()
    const requestedQueries: string[] = []
    server.use(
      http.get('*/ingredients/names', ({ request }) => {
        const url = new URL(request.url)
        requestedQueries.push(url.searchParams.get('q') ?? '')
        return HttpResponse.json(['Flour', 'Flaked almonds'])
      }),
    )

    render(<Harness />)
    const input = screen.getByLabelText('Ingredient name')

    await user.type(input, 'fl')

    // Give the debounce window a chance to settle, then assert only ONE
    // request went out — for the final settled value, not one per keystroke
    // (which would have produced two: "f" then "fl").
    await waitFor(() => expect(requestedQueries.length).toBeGreaterThan(0))
    expect(requestedQueries).toEqual(['fl'])
  })

  it('requests the typed prefix as ?q= and shows results as datalist options', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/ingredients/names', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('q')).toBe('fl')
        return HttpResponse.json(['Flour', 'Flaked almonds'])
      }),
    )

    render(<Harness />)
    const input = screen.getByLabelText('Ingredient name') as HTMLInputElement
    await user.type(input, 'fl')

    await waitFor(() => {
      // useId() ids contain colons, which aren't valid unescaped in a CSS
      // selector — look the <datalist> up by id directly instead.
      const listId = input.getAttribute('list')!
      const datalist = document.getElementById(listId) as HTMLDataListElement
      const options = Array.from(datalist.options).map((o) => o.value)
      expect(options).toEqual(['Flour', 'Flaked almonds'])
    })
  })

  it('stays a plain text input — a brand-new ingredient not in the suggestions is always enterable', async () => {
    const user = userEvent.setup()
    server.use(http.get('*/ingredients/names', () => HttpResponse.json(['Flour', 'Flaked almonds'])))

    render(<Harness />)
    const input = screen.getByLabelText('Ingredient name') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('type')).not.toBe('select')

    await user.type(input, 'Unobtainium root')
    await waitFor(() => expect(input).toHaveAttribute('list'))

    // Nothing constrains the typed value — it isn't one of the returned suggestions.
    expect(input.value).toBe('Unobtainium root')
  })
})
