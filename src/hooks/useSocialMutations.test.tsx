// ─────────────────────────────────────────────────────────────────────────
// Regression: the optimistic social patches must survive a NON-LIST query
// cached under the feed subtree (2026-08-10).
//
// The feed redesign parked GET /feed/activity at ['feed', 'activity', scope] —
// a plain useQuery whose data is `{ items }` with no `pages`. patchFeedCaches
// matched on ['feed'], so it handed that entry to an updater that does
// `data.pages.map(...)`. The TypeError escaped onMutate, which means React
// Query never called mutationFn: every like and save stopped reaching the
// server, on /feed AND on Discover (one app-level QueryClient, and the entry
// outlives the page that created it by the default gcTime).
//
// The seeded activity entry below is the whole point of these tests. Bite-check
// them by widening patchFeedCaches back to queryKeys.feed.all: the two toggle
// tests fail on "expected likeRecipe to be called".
// ─────────────────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryKeys } from '@/api/queryKeys'
import * as api from '@/api/social'
import type { FeedActivityListResponse, FeedItemResponse } from '@/api/social'
import { useSocialMutations } from './useSocialMutations'

function makeItem(id: string, over: Partial<FeedItemResponse> = {}): FeedItemResponse {
  return {
    recipe: {
      id,
      title: 'Tomato tart',
      description: 'A very shareable dinner.',
      prepTimeMinutes: 10,
      cookTimeMinutes: 15,
      totalTimeMinutes: 25,
      servings: 2,
      difficulty: 'Easy',
      cuisineType: 'Italian',
      caloriesPerServing: 420,
      imageUrl: null,
      visibility: 'Public',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: null,
      ingredients: [],
      steps: [],
      tags: [],
      createdByUserId: 'author-1',
    },
    author: { id: 'author-1', username: 'chef_ana', profileImageUrl: null },
    likeCount: 5,
    commentCount: 3,
    likedByMe: false,
    savedByMe: false,
    averageRating: null,
    ratingCount: 0,
    cookedByMe: false,
    myRating: null,
    madeItCount: 0,
    recentMakers: [],
    ...over,
  }
}

/** The rail's strip exactly as the endpoint answers it: no `pages`. */
const ACTIVITY: FeedActivityListResponse = {
  items: [
    {
      actor: { id: 'author-2', username: 'nadia', profileImageUrl: null },
      kind: 'Cooked',
      recipeId: 'r1',
      recipeTitle: 'Tomato tart',
      occurredAt: '2026-08-09T18:00:00Z',
    },
  ],
}

type FeedCache = { pages: { items: FeedItemResponse[] }[]; pageParams: unknown[] }

/** A client holding both feed-subtree shapes: a paged list AND the activity strip. */
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.feed.list('forYou'), {
    pages: [{ items: [makeItem('r1')], nextCursor: null, source: 'forYou' }],
    pageParams: [undefined],
  })
  client.setQueryData(queryKeys.feed.activity('forYou'), ACTIVITY)

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const feedItem = () =>
    (client.getQueryData(queryKeys.feed.list('forYou')) as FeedCache).pages[0].items[0]

  return { client, wrapper, feedItem }
}

describe('useSocialMutations with the /feed/activity entry cached', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends the like and patches the feed list', async () => {
    const like = vi.spyOn(api, 'likeRecipe').mockResolvedValue(undefined)
    const { wrapper, feedItem } = setup()

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.toggleLike.mutateAsync({ recipeId: 'r1', next: true })

    expect(like).toHaveBeenCalledWith('r1')
    expect(feedItem().likedByMe).toBe(true)
    expect(feedItem().likeCount).toBe(6)
  })

  it('sends the save and patches the feed list', async () => {
    const save = vi.spyOn(api, 'saveRecipe').mockResolvedValue(undefined)
    const { wrapper, feedItem } = setup()

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.toggleSave.mutateAsync({ recipeId: 'r1', next: true })

    expect(save).toHaveBeenCalledWith('r1')
    expect(feedItem().savedByMe).toBe(true)
  })

  it('leaves the activity strip untouched', async () => {
    vi.spyOn(api, 'likeRecipe').mockResolvedValue(undefined)
    const { client, wrapper } = setup()

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.toggleLike.mutateAsync({ recipeId: 'r1', next: true })

    // Not merely uncrashed — unchanged. The strip is a log of past events; a
    // like is not one of them, and a patch that "fixed" it would be inventing.
    expect(client.getQueryData(queryKeys.feed.activity('forYou'))).toEqual(ACTIVITY)
  })

  it('rolls the like back when the request fails', async () => {
    vi.spyOn(api, 'likeRecipe').mockRejectedValue(new Error('boom'))
    const { wrapper, feedItem } = setup()

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    result.current.toggleLike.mutate({ recipeId: 'r1', next: true })

    // The rollback needs a real onMutate context — which is exactly what the
    // thrown TypeError used to deny it, leaving a filled heart nothing backed.
    await waitFor(() => expect(result.current.toggleLike.isError).toBe(true))
    expect(feedItem().likedByMe).toBe(false)
    expect(feedItem().likeCount).toBe(5)
  })
})
