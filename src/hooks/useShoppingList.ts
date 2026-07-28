// ─────────────────────────────────────────────────────────────────────────
// The single per-user shopping list (meal-planning-v1-semantics #3) —
// keyset-paged reads plus the three writes. Ticking is optimistic because
// PATCH is an explicit idempotent set: a double-tap can't corrupt anything.
// ─────────────────────────────────────────────────────────────────────────

import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import {
  addShoppingListItem,
  deleteShoppingListItem,
  getShoppingListPage,
  setShoppingListItemPurchased,
  type ShoppingListResponse,
} from '@/api/mealPlans'

const PAGE_SIZE = 30

export function useShoppingList() {
  return useInfiniteQuery({
    queryKey: queryKeys.shoppingList.list(),
    queryFn: ({ pageParam, signal }) => getShoppingListPage({ cursor: pageParam, limit: PAGE_SIZE, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
}

type ListCache = InfiniteData<ShoppingListResponse> | undefined

export function useShoppingListMutations() {
  const queryClient = useQueryClient()
  const listKey = queryKeys.shoppingList.list()

  const setPurchased = useMutation({
    mutationFn: ({ id, isPurchased }: { id: string; isPurchased: boolean }) =>
      setShoppingListItemPurchased(id, isPurchased),
    onMutate: async ({ id, isPurchased }) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const snapshot = queryClient.getQueryData<ListCache>(listKey)
      queryClient.setQueryData<ListCache>(listKey, (cache) =>
        cache && {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            items: page.items.map((item) => (item.id === id ? { ...item, isPurchased } : item)),
          })),
        },
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(listKey, context.snapshot)
    },
  })

  const addItem = useMutation({
    mutationFn: (item: { ingredient: string; quantity: string }) => addShoppingListItem(item),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: listKey }),
  })

  const removeItem = useMutation({
    mutationFn: (id: string) => deleteShoppingListItem(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: listKey })
      const snapshot = queryClient.getQueryData<ListCache>(listKey)
      queryClient.setQueryData<ListCache>(listKey, (cache) =>
        cache && {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== id),
          })),
        },
      )
      return { snapshot }
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) queryClient.setQueryData(listKey, context.snapshot)
    },
  })

  return { setPurchased, addItem, removeItem }
}
