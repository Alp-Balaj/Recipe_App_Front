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

  it('drops the flag when the server says there is no cook behind it', async () => {
    // A rating with no cook behind it (a row from before KAN-7, or a dish whose
    // cooks were all taken back) reports cookedByMe false since KAN-13 — and
    // retracting the rating is the call that tells the client so.
    vi.spyOn(api, 'clearRating').mockResolvedValue({ recipeId: 'r1', timesCooked: 0, rating: null, cookedByMe: false })
    const { wrapper, feedItem } = setup({ cookedByMe: true, myRating: 4, ratingCount: 1, averageRating: 4 })

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.setRating.mutateAsync({ recipeId: 'r1', rating: null })

    expect(feedItem().cookedByMe).toBe(false)
  })

  it('takes the flag from the reply even when timesCooked would say otherwise', async () => {
    // The pair this test forms with the one above is the point: same timesCooked
    // (0), opposite answers, both honoured. That is only possible if the client
    // READS the flag instead of deriving it — which is the contract, because the
    // derivation is the server's and has already changed once (row existence ->
    // cook count, KAN-13). useSocialEnvelope prefers a patch over the wire, so a
    // client that derived locally would overwrite the server's answer with its own
    // stale rule and the wrong value would stick rather than heal on the next read.
    //
    // This particular combination is one the CURRENT server would not send — since
    // KAN-13 a 0 count means false. It is mocked deliberately: the test is about
    // who owns the rule, and pinning it to today's rule is exactly what would let
    // the next change to it slip through unnoticed.
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

// ─────────────────────────────────────────────────────────────────────────
// KAN-23: logging a cook makes you a MAKER, and the feed has to hear about it.
//
// madeItCount and recentMakers are computed on TimesCooked > 0 (ADR-0005), and
// this gesture is the write that crosses that line — so every cached feed page
// is one maker short until it refetches. `logCooked` is the Cook Mode finish for
// a cook with no plan slot behind it; the plan-slot path is useCookLog's, and
// that one has always invalidated.
//
// Bite-check: delete the `invalidateQueries({ queryKey: queryKeys.feed.all })`
// from logCooked's onSuccess and both tests below fail on isInvalidated. Narrow
// it to feed.lists() and the second one alone fails.
//
// The madeItCount expectation is the exception and is honestly labelled: it
// rides along to state criterion 3 (no count derived on the client) and has no
// bite of its own, because nothing patches that field in either direction.
// ─────────────────────────────────────────────────────────────────────────
describe('logging a cook that is not tied to a plan slot', () => {
  beforeEach(() => vi.restoreAllMocks())

  const COOKED = { recipeId: 'r1', timesCooked: 1, rating: null, cookedByMe: true }

  it('refreshes the feed instead of counting the new maker itself', async () => {
    const markCooked = vi.spyOn(api, 'markCooked').mockResolvedValue(COOKED)
    const { client, wrapper, feedItem } = setup({ madeItCount: 2, cookedByMe: false })

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.logCooked.mutateAsync({ recipeId: 'r1' })

    expect(markCooked).toHaveBeenCalledWith('r1')
    expect(client.getQueryState(queryKeys.feed.list('forYou'))?.isInvalidated).toBe(true)
    // The flag IS patched — it is the caller's own claim off an accepted write.
    expect(feedItem().cookedByMe).toBe(true)
    // The count is not. It stays the server's last word until the refetch brings
    // the next one; a local +1 would have to guess whether the caller was already
    // among the distinct makers it counts.
    expect(feedItem().madeItCount).toBe(2)
  })

  it('marks the activity strip stale too — a cook is a row it can gain', async () => {
    vi.spyOn(api, 'markCooked').mockResolvedValue(COOKED)
    const { client, wrapper } = setup()

    const { result } = renderHook(() => useSocialMutations(), { wrapper })
    await result.current.logCooked.mutateAsync({ recipeId: 'r1' })

    // Which is why this invalidates through `all` and not `lists()`: "cooking
    // right now" is exactly the strip this gesture belongs in.
    expect(client.getQueryState(queryKeys.feed.activity('forYou'))?.isInvalidated).toBe(true)
  })
})
