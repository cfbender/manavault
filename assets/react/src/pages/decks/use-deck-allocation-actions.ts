import { useApolloClient, useMutation } from "@apollo/client/react"
import { useState } from "react"

import { pluralize } from "../../lib/utils"
import type { DeckPullListEntry } from "./deck-allocation-model"
import type { DeckDetail } from "./deck-types"
import {
  AllocateDeckCardItemDocument,
  AllocateDeckPullListDocument,
  AllocateDeckCardProxyDocument,
  DeallocateDeckCardItemDocument,
  DeallocateDeckCardProxyDocument,
  OptimizeDeckCardPrintingsDocument,
} from "./queries"

type UseDeckAllocationActionsOptions = {
  onRefetch: () => void
  onToast: (message: string) => void
}


export function useDeckAllocationActions({ onRefetch, onToast }: UseDeckAllocationActionsOptions) {
  const client = useApolloClient()
  const [isBulkAllocating, setIsBulkAllocating] = useState(false)
  const [isOptimizingPrintings, setIsOptimizingPrintings] = useState(false)
  const [allocateDeckCardItemMutation, allocateDeckCardItemResult] = useMutation(
    AllocateDeckCardItemDocument,
  )
  const [deallocateDeckCardItemMutation, deallocateDeckCardItemResult] = useMutation(
    DeallocateDeckCardItemDocument,
  )
  const [allocateDeckCardProxyMutation, allocateDeckCardProxyResult] = useMutation(
    AllocateDeckCardProxyDocument,
  )
  const [deallocateDeckCardProxyMutation, deallocateDeckCardProxyResult] = useMutation(
    DeallocateDeckCardProxyDocument,
  )
  const [optimizeDeckCardPrintingsMutation] = useMutation(OptimizeDeckCardPrintingsDocument)

  function allocate(deckCardId: string, collectionItemId: string) {
    void allocateDeckCardItemMutation({
      variables: { deckCardId, collectionItemId },
      onError: () => undefined,
    })
  }

  function deallocate(deckCardId: string, collectionItemId: string) {
    void deallocateDeckCardItemMutation({
      variables: { deckCardId, collectionItemId },
      onError: () => undefined,
    })
  }

  function toggleProxy(deckCard: DeckDetail["deckCards"][number]) {
    const status = deckCard.allocationStatus
    if (status.proxyAllocated > 0) {
      void deallocateDeckCardProxyMutation({
        variables: { deckCardId: deckCard.id, quantity: status.proxyAllocated },
        onError: () => undefined,
      })
      return
    }

    const quantity = Math.max(status.required - status.allocated, 0)
    if (quantity > 0) {
      void allocateDeckCardProxyMutation({
        variables: { deckCardId: deckCard.id, quantity },
        onError: () => undefined,
      })
    }
  }

  function allocatePullList(
    deck: DeckDetail,
    entries: DeckPullListEntry[],
    handlers: {
      onError: (message: string) => void
      onSkipped: (message: string) => void
      onSuccess: () => void
    },
  ) {
    setIsBulkAllocating(true)
    void client
      .mutate({
        mutation: AllocateDeckPullListDocument,
        variables: {
          deckId: deck.id,
          entries: entries.map((entry) => ({
            deckCardId: entry.deckCard.id,
            collectionItemId: entry.candidate.item.id,
            quantity: entry.quantity,
          })),
        },
      })
      .then(({ data }) => {
        const result = data?.allocateDeckPullList?.allocationResult
        if (result && result.skipped > 0) {
          handlers.onSkipped(`${pluralize(result.skipped, "entry", "entries")} could not be allocated`)
          return
        }

        const allocated = result?.allocated ?? entries.reduce((total, entry) => total + entry.quantity, 0)
        onToast(`${pluralize(allocated, "card")} allocated`)
        handlers.onSuccess()
      })
      .catch((error: unknown) =>
        handlers.onError(error instanceof Error ? error.message : "Could not allocate deck"),
      )
      .finally(() => {
        onRefetch()
        setIsBulkAllocating(false)
      })
  }

  function optimizePrintings(
    deckCardIds: string[],
    handlers: { onError: (message: string) => void; onSuccess: () => void },
  ) {
    setIsOptimizingPrintings(true)
    void optimizeDeckCardPrintingsMutation({ variables: { deckCardIds } })
      .then(({ data }) => {
        const optimizedCount = data?.optimizeDeckCardPrintings?.deckCards.length ?? 0
        onRefetch()
        onToast(
          optimizedCount > 0
            ? `${pluralize(optimizedCount, "printing")} optimized`
            : "Printings already optimized",
        )
        handlers.onSuccess()
      })
      .catch((error: unknown) =>
        handlers.onError(error instanceof Error ? error.message : "Could not optimize printings"),
      )
      .finally(() => setIsOptimizingPrintings(false))
  }

  const allocationError = [
    allocateDeckCardItemResult.error,
    deallocateDeckCardItemResult.error,
    allocateDeckCardProxyResult.error,
    deallocateDeckCardProxyResult.error,
  ].find((error): error is Error => error instanceof Error)?.message ?? null

  return {
    allocate,
    allocatePullList,
    allocationError,
    deallocate,
    isAllocating:
      allocateDeckCardItemResult.loading ||
      deallocateDeckCardItemResult.loading ||
      allocateDeckCardProxyResult.loading ||
      deallocateDeckCardProxyResult.loading,
    isBulkAllocating,
    isOptimizingPrintings,
    optimizePrintings,
    toggleProxy,
  }
}
