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
function setup(item: Partial<FeedItemResponse> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.feed.list('forYou'), {
    pages: [{ items: [makeItem('r1', item)], nextCursor: null, source: 'forYou' }],
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

// ─────────────────────────────────────────────────────────────────────────
// KAN-12: taking a rating back is a claim about the RATING.
//
// It used to be routed to DELETE /recipes/{id}/cooked — "I have never cooked
// this" — which hard-deletes every cook of that recipe and every note written
// on one, across every plan slot, silently. Tapping the star you already gave
// is not that sentence.
// ─────────────────────────────────────────────────────────────────────────
describe('retracting a rating', () => {
  beforeEach(() => vi.restoreAllMocks())

  const RATED_AND_COOKED = { cookedByMe: true, myRating: 4, ratingCount: 1, averageRating: 4 }

  it('goes to the rating endpoint and never to the one that clears the cooks', async () => {
    const clearRating = vi
      .spyOn(api, 'clearRating')
      .mockResolvedValue({ recipeId: 'r1', timesCooked: 4, rating: null, cookedByMe: true })
    const clearCooked = vi.spyOn(api, 'clearCooked')
    const { wrapper, feedItem } = setup(RATED_AND_COOKED)

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.setRating.mutateAsync({ recipeId: 'r1', rating: null })

    expect(clearRating).toHaveBeenCalledWith('r1')
    expect(clearCooked).not.toHaveBeenCalled()
    // The rating is what left. The last rating going means the average is
    // unknown again rather than zero, which the existing recompute already does.
    expect(feedItem().myRating).toBeNull()
    expect(feedItem().averageRating).toBeNull()
    expect(feedItem().ratingCount).toBe(0)
  })

  it('leaves "you cooked this" standing — the cooks survived the retract', async () => {
    vi.spyOn(api, 'clearRating').mockResolvedValue({ recipeId: 'r1', timesCooked: 4, rating: null, cookedByMe: true })
    const { client, wrapper, feedItem } = setup(RATED_AND_COOKED)
    client.setQueryData(queryKeys.social.envelope('r1'), {
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      savedByMe: false,
      averageRating: 4,
      ratingCount: 1,
      cookedByMe: true,
      myRating: 4,
    })

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.setRating.mutateAsync({ recipeId: 'r1', rating: null })

    // Both caches, because they are read by different surfaces and a flag that
    // is right on one and wrong on the other is the same bug half the time.
    expect(feedItem().cookedByMe).toBe(true)
    expect(
      (client.getQueryData(queryKeys.social.envelope('r1')) as { cookedByMe: boolean }).cookedByMe,
    ).toBe(true)
  })

  it('drops the flag when the server says the row is gone', async () => {
    // Rating without cooking is allowed, and the row it creates is what makes
    // cookedByMe true for someone who never cooked. Retracting removes that row,
    // and the server's own flag is how the client learns it did.
    vi.spyOn(api, 'clearRating').mockResolvedValue({ recipeId: 'r1', timesCooked: 0, rating: null, cookedByMe: false })
    const { wrapper, feedItem } = setup({ cookedByMe: true, myRating: 4, ratingCount: 1, averageRating: 4 })

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.setRating.mutateAsync({ recipeId: 'r1', rating: null })

    expect(feedItem().cookedByMe).toBe(false)
  })

  it('keeps the flag when the count is 0 but the row survived', async () => {
    // The drift branch: TimesCooked has fallen to 0 with cook-log rows still
    // behind it, so the server keeps the row and says so. Deriving the flag from
    // timesCooked here tells the user they have never cooked a dish their own
    // cook log still lists — and useSocialEnvelope prefers the patch over the
    // wire, so that answer would stick rather than heal on the next read.
    vi.spyOn(api, 'clearRating').mockResolvedValue({ recipeId: 'r1', timesCooked: 0, rating: null, cookedByMe: true })
    const { wrapper, feedItem } = setup({ cookedByMe: true, myRating: 4, ratingCount: 1, averageRating: 4 })

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.setRating.mutateAsync({ recipeId: 'r1', rating: null })

    expect(feedItem().cookedByMe).toBe(true)
  })

  it('rolls back when the retract fails', async () => {
    vi.spyOn(api, 'clearRating').mockRejectedValue(new Error('boom'))
    const { wrapper, feedItem } = setup(RATED_AND_COOKED)

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    result.current.setRating.mutate({ recipeId: 'r1', rating: null })

    await waitFor(() => expect(result.current.setRating.isError).toBe(true))
    // myRating alone: onMutate no longer touches cookedByMe and onSuccess does not
    // run on an error, so asserting the flag here would pass with restoreCaches
    // deleted entirely.
    expect(feedItem().myRating).toBe(4)
    expect(feedItem().averageRating).toBe(4)
  })
})
