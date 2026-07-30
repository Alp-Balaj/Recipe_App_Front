import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { useForm } from 'react-hook-form'
import { server } from '@/test/msw/server'
import { IngredientNameField } from './IngredientNameField'

// fix round 1, F2: fake timers + @testing-library/user-event's own internal
// scheduling hang indefinitely together (confirmed with a minimal repro outside
// this component — a vitest 4.1.10 / user-event 14.6.1 interaction issue, not
// specific to this field). fireEvent.change sidesteps user-event's scheduling
// entirely, so `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync` work fine
// with it — no need for a test-only debounceMs seam on the component; the
// production 300ms interval (IngredientNameField.tsx's DEBOUNCE_MS) is what
// every test below actually exercises.
function Harness() {
  const { register } = useForm<{ name: string }>({ defaultValues: { name: '' } })
  return <IngredientNameField label="Name" aria-label="Ingredient name" registration={register('name')} />
}

describe('IngredientNameField', () => {
  beforeEach(() => {
    // Fake only setTimeout/clearTimeout — faking everything (Date, fetch's own
    // internal scheduling via undici) hangs MSW's real network layer forever.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces the query — typing does not fire a request per keystroke', async () => {
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

    // Two keystrokes, each resetting the debounce timer.
    fireEvent.change(input, { target: { value: 'f' } })
    fireEvent.change(input, { target: { value: 'fl' } })

    // Nothing has fired yet — still within the debounce window.
    expect(requestedQueries).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(300)

    // Exactly one request, for the settled value — not one per keystroke
    // (which would have produced two: "f" then "fl").
    expect(requestedQueries).toEqual(['fl'])
  })

  it('requests the typed prefix as ?q= and shows results as datalist options', async () => {
    server.use(
      http.get('*/ingredients/names', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('q')).toBe('fl')
        return HttpResponse.json(['Flour', 'Flaked almonds'])
      }),
    )

    render(<Harness />)
    const input = screen.getByLabelText('Ingredient name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'fl' } })

    await vi.advanceTimersByTimeAsync(300)

    // useId() ids contain colons, which aren't valid unescaped in a CSS
    // selector — look the <datalist> up by id directly instead.
    const listId = input.getAttribute('list')!
    const datalist = document.getElementById(listId) as HTMLDataListElement
    const options = Array.from(datalist.options).map((o) => o.value)
    expect(options).toEqual(['Flour', 'Flaked almonds'])
  })

  it('stays a plain text input — a brand-new ingredient not in the suggestions is always enterable', async () => {
    server.use(http.get('*/ingredients/names', () => HttpResponse.json(['Flour', 'Flaked almonds'])))

    render(<Harness />)
    const input = screen.getByLabelText('Ingredient name') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.getAttribute('type')).not.toBe('select')

    fireEvent.change(input, { target: { value: 'Unobtainium root' } })
    await vi.advanceTimersByTimeAsync(300)

    // Nothing constrains the typed value — it isn't one of the returned suggestions.
    expect(input.value).toBe('Unobtainium root')
  })
})
