import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryKeys } from '@/api/queryKeys'
import { useCookLogMutations } from './useCookLog'
import { useSocialEnvelope, type SocialEnvelope } from './useSocialEnvelope'
import * as api from '@/api/cookLog'
import type { CookLogEntry, UncookResponse } from '@/api/cookLog'
import type { FeedItemResponse } from '@/api/social'

function clientWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const entry: CookLogEntry = {
  id: 'c1',
  recipeId: 'r1',
  recipeTitle: 'Toast',
  mealPlanEntryId: 'e1',
  cookedAt: '2026-08-10T12:00:00Z',
  recipeAvailable: true,
}

/** The reply both un-log gestures now answer with (KAN-18). */
const uncooked: UncookResponse = {
  recipes: [{ recipeId: 'r1', timesCooked: 0, rating: null, lastCookedAt: null, cookedByMe: false }],
}
const stillCooked: UncookResponse = {
  recipes: [
    { recipeId: 'r1', timesCooked: 2, rating: null, lastCookedAt: '2026-08-10T12:00:00Z', cookedByMe: true },
  ],
}
/** The idempotent entry-scoped repeat: nothing was written, so nothing changed. */
const nothingChanged: UncookResponse = { recipes: [] }

/** One cached feed card for r1, showing the caller as having cooked it. */
function feedItem(): FeedItemResponse {
  return {
    recipe: {
      id: 'r1',
      title: 'Toast',
      description: 'Bread, applied heat.',
      prepTimeMinutes: 1,
      cookTimeMinutes: 3,
      totalTimeMinutes: 4,
      servings: 1,
      difficulty: 'Easy',
      cuisineType: 'British',
      caloriesPerServing: 120,
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
    likeCount: 4,
    commentCount: 2,
    likedByMe: false,
    savedByMe: true,
    averageRating: 4.5,
    ratingCount: 2,
    cookedByMe: true,
    myRating: 5,
    madeItCount: 1,
    recentMakers: [],
  }
}

/**
 * cooked-per-plan-entry, Task 5: a cook must invalidate the shopping list under
 * the KEY the shop page actually reads, not merely fire SOME invalidation. The
 * feed redesign's cache-key bug (useSocialMutations.test.tsx's header comment)
 * came from a patch aimed at a key that looked right and did not match — this
 * test pins the literal key so that mistake can't repeat here silently.
 */
describe('useCookLogMutations', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('invalidates the shopping list and meal plans under the keys those pages actually read', async () => {
    const log = vi.spyOn(api, 'logCook').mockResolvedValue(entry)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

    result.current.log.mutate({ recipeId: 'r1', mealPlanEntryId: 'e1' })
    await waitFor(() => expect(result.current.log.isSuccess).toBe(true))

    expect(log).toHaveBeenCalledWith('r1', 'e1', undefined)
    // Assert the KEY, not merely that an invalidation happened.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.shopping.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.mealPlans.all })
  })

  it('unlog sends the DELETE and invalidates the same four caches as log', async () => {
    const unlog = vi.spyOn(api, 'uncookEntry').mockResolvedValue(nothingChanged)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

    result.current.unlog.mutate({ mealPlanEntryId: 'e1' })
    await waitFor(() => expect(result.current.unlog.isSuccess).toBe(true))

    expect(unlog).toHaveBeenCalledWith('e1')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cookLog.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.feed.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.mealPlans.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.shopping.all })
  })

  /**
   * KAN-8. Writing a note used to touch only the cook-log caches, on the reasoning
   * that no counter had moved. That stopped being true the moment the planned-meal
   * read began reporting `cookNoteCount`: a note now changes what GET /meal-plans
   * says about the slot, and the day page's un-cook toggle reads exactly that field
   * to decide whether to ask before deleting.
   *
   * Production staleTime is 30s (src/main.tsx), so without this invalidation the
   * sequence "write a note, go back to the day, un-tick" is served a cached count of
   * 0 — no dialog, note gone. Which is the failure this ticket exists to remove, so
   * the guard has to survive the cache, not just the happy path.
   */
  it('a saved note invalidates the plan read that decides whether un-cooking asks', async () => {
    const save = vi.spyOn(api, 'updateCookNote').mockResolvedValue({ ...entry, note: 'More harissa' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

    result.current.saveNote.mutate({ id: 'c1', note: 'More harissa' })
    await waitFor(() => expect(result.current.saveNote.isSuccess).toBe(true))

    expect(save).toHaveBeenCalledWith('c1', 'More harissa')
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.cookLog.all })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.mealPlans.all })
    // Still NOT the social caches: annotating a cook moves no counter they read,
    // so the original reasoning holds for everything except the plan.
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.feed.all })
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.shopping.all })
  })

  /**
   * KAN-18 — un-logging the last cook of a dish must turn "you cooked this" off on
   * the recipe page, which is the one surface that never heals on its own.
   *
   * The setup below is the bug's exact shape: an already-seeded per-recipe
   * SocialEnvelope (staleTime Infinity, patched by mutations, never re-synced by a
   * later feed refetch — the limitation useSocialEnvelope's header records) beside
   * a cached feed page for the same recipe. The feed card self-corrects because the
   * un-log invalidates the feed; the envelope only changes if something WRITES it.
   *
   * Bite-check: replace `applyUncooked` in useCookLog.ts with the plain
   * `invalidate` these mutations used to call — or with an `invalidate` widened to
   * include `queryKeys.social.envelopes`, which is the fix that looks right — and
   * the two "flips the flag" tests below go red. The invalidated queryFn re-reads
   * its own cached entry, finds it fully known and returns it unchanged, so the
   * flag survives its own refetch.
   */
  describe('un-logging and the cooked flag (KAN-18)', () => {
    function cookedSetup() {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
      // Fully known, exactly as the detail page holds it after its F1 fetch: nothing
      // is left for the fallback to add, so no request can quietly do this test's job.
      const seeded: SocialEnvelope = {
        likeCount: 4,
        commentCount: 2,
        likedByMe: false,
        savedByMe: true,
        averageRating: 4.5,
        ratingCount: 2,
        cookedByMe: true,
        myRating: 5,
      }
      client.setQueryData(queryKeys.social.envelope('r1'), seeded)
      client.setQueryData(queryKeys.feed.list('forYou'), {
        pages: [{ items: [feedItem()], nextCursor: null, source: 'forYou' }],
        pageParams: [undefined],
      })

      const render = () =>
        renderHook(
          () => ({
            // fetchFallback: true — the detail page's own options, so the queryFn
            // that KAN-18's trap lives in is the one under test.
            envelope: useSocialEnvelope('r1', undefined, { fetchFallback: true }),
            mutations: useCookLogMutations(),
          }),
          { wrapper: clientWrapper(client) },
        )
      const cachedFeedItem = () =>
        (client.getQueryData(queryKeys.feed.list('forYou')) as {
          pages: { items: FeedItemResponse[] }[]
        }).pages[0].items[0]

      return { client, render, cachedFeedItem }
    }

    it('the row-scoped un-log of the last cook turns the recipe page flag off', async () => {
      const unlogOne = vi.spyOn(api, 'unlogCook').mockResolvedValue(uncooked)
      const { render, cachedFeedItem } = cookedSetup()

      const { result } = render()
      expect(result.current.envelope.cookedByMe).toBe(true)

      result.current.mutations.unlogOne.mutate({ id: 'c1' })
      await waitFor(() => expect(result.current.envelope.cookedByMe).toBe(false))

      expect(unlogOne).toHaveBeenCalledWith('c1')
      // And the two surfaces agree: the feed card is patched from the same reply
      // rather than being left to a refetch that may not have landed yet.
      expect(cachedFeedItem().cookedByMe).toBe(false)
    })

    it('the entry-scoped un-log flips it too — the older gesture, wrong since KAN-13', async () => {
      const unlog = vi.spyOn(api, 'uncookEntry').mockResolvedValue(uncooked)
      const { render } = cookedSetup()

      const { result } = render()
      result.current.mutations.unlog.mutate({ mealPlanEntryId: 'e1' })
      await waitFor(() => expect(result.current.envelope.cookedByMe).toBe(false))

      expect(unlog).toHaveBeenCalledWith('e1')
    })

    it('un-logging one of several cooks leaves the flag on', async () => {
      vi.spyOn(api, 'unlogCook').mockResolvedValue(stillCooked)
      const { render, cachedFeedItem } = cookedSetup()

      const { result } = render()
      result.current.mutations.unlogOne.mutate({ id: 'c1' })
      await waitFor(() => expect(result.current.mutations.unlogOne.isSuccess).toBe(true))

      // The server said the dish is still cooked, and that is the whole answer —
      // this is where a client deriving the flag from "a cook was removed" is wrong.
      expect(result.current.envelope.cookedByMe).toBe(true)
      expect(cachedFeedItem().cookedByMe).toBe(true)
    })

    it('cooking it again takes the flag back', async () => {
      vi.spyOn(api, 'unlogCook').mockResolvedValue(uncooked)
      vi.spyOn(api, 'logCook').mockResolvedValue(entry)
      const { render } = cookedSetup()

      const { result } = render()
      result.current.mutations.unlogOne.mutate({ id: 'c1' })
      await waitFor(() => expect(result.current.envelope.cookedByMe).toBe(false))

      result.current.mutations.log.mutate({ recipeId: 'r1' })
      await waitFor(() => expect(result.current.envelope.cookedByMe).toBe(true))

      // The half that only became reachable because un-log now WRITES the entry.
      // A false that nothing takes back is worse than the stale true it replaced:
      // useSocialEnvelope's merge is `latest.cookedByMe ?? wire.cookedByMe`, so a
      // written false outranks the server on every later read of this entry.
    })

    it('an un-log that removed nothing patches nothing', async () => {
      vi.spyOn(api, 'uncookEntry').mockResolvedValue(nothingChanged)
      const { render } = cookedSetup()

      const { result } = render()
      result.current.mutations.unlog.mutate({ mealPlanEntryId: 'e1' })
      await waitFor(() => expect(result.current.mutations.unlog.isSuccess).toBe(true))

      // The idempotent repeat: no rows went, so no flag moves. Writing `false` here
      // off the gesture alone would report a dish as un-cooked because someone
      // un-cooked an already-empty slot.
      expect(result.current.envelope.cookedByMe).toBe(true)
    })
  })

  /**
   * `networkMode: 'always'` (see useSocialMutations.ts's note on `logCooked`
   * for the full incident): a mutation fired while react-query believes the
   * browser is offline is normally PAUSED, not sent, on the promise that it
   * resumes on reconnect — a promise a real browser pass found does not hold.
   * jsdom cannot fake an actual offline network, but `onlineManager` is the
   * exact signal react-query itself branches on to decide pause vs. send, so
   * flipping it here exercises the real fork: with the default 'online' mode
   * this mutation would sit in `isPaused` and never call the API; dropping
   * `networkMode: 'always'` from either mutation turns this red.
   */
  describe('offline (networkMode)', () => {
    afterEach(() => onlineManager.setOnline(true))

    it('log still fires while react-query believes the browser is offline', async () => {
      onlineManager.setOnline(false)
      const log = vi.spyOn(api, 'logCook').mockResolvedValue(entry)
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

      const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

      result.current.log.mutate({ recipeId: 'r1', mealPlanEntryId: 'e1' })
      await waitFor(() => expect(result.current.log.isSuccess).toBe(true))

      expect(log).toHaveBeenCalledWith('r1', 'e1', undefined)
      expect(result.current.log.isPaused).toBe(false)
    })

    it('unlog still fires while react-query believes the browser is offline', async () => {
      onlineManager.setOnline(false)
      const unlog = vi.spyOn(api, 'uncookEntry').mockResolvedValue(nothingChanged)
      const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

      const { result } = renderHook(() => useCookLogMutations(), { wrapper: clientWrapper(client) })

      result.current.unlog.mutate({ mealPlanEntryId: 'e1' })
      await waitFor(() => expect(result.current.unlog.isSuccess).toBe(true))

      expect(unlog).toHaveBeenCalledWith('e1')
      expect(result.current.unlog.isPaused).toBe(false)
    })
  })
})
