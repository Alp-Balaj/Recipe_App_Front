import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw/server'
import { useFollowList } from '@/hooks/useFollowList'
import { queryKeys } from '@/api/queryKeys'
import type { ReactNode } from 'react'

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('useFollowList', () => {
  it('sends q to the endpoint and keys the cache by it', async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get('*/users/:id/followers', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q'))
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useFollowList('u1', 'followers', true, 'mira'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seen).toEqual(['mira'])
    expect(client.getQueryData(queryKeys.users.followers('u1', 'mira'))).toBeDefined()
    // The unfiltered cache must be untouched, or a search would clobber the full list.
    expect(client.getQueryData(queryKeys.users.followers('u1'))).toBeUndefined()
  })

  it('omits q entirely when the search box is empty', async () => {
    const seen: (string | null)[] = []
    server.use(
      http.get('*/users/:id/followers', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('q'))
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => useFollowList('u1', 'followers'), {
      wrapper: wrapper(client),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(seen).toEqual([null])
  })
})
