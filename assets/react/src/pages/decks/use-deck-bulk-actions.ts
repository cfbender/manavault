import { useMutation } from "@apollo/client/react"
import { useState } from "react"

import type { DeckCardUpdateInput } from "../../gql/graphql"
import { pluralize } from "../../lib/utils"
import {
  BulkDeallocateDeckCardsDocument,
  BulkDeleteDeckCardsDocument,
  BulkUpdateDeckCardsDocument,
} from "./queries"

type UseDeckBulkActionsOptions = {
  onClearSelection: () => void
  onRefetch: () => void
  onToast: (message: string) => void
}

export function useDeckBulkActions({
  onClearSelection,
  onRefetch,
  onToast,
}: UseDeckBulkActionsOptions) {
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDeallocating, setIsDeallocating] = useState(false)
  const [bulkUpdateDeckCardsMutation] = useMutation(BulkUpdateDeckCardsDocument)
  const [bulkDeleteDeckCardsMutation] = useMutation(BulkDeleteDeckCardsDocument)
  const [bulkDeallocateDeckCardsMutation] = useMutation(BulkDeallocateDeckCardsDocument)

  function update(deckCardIds: string[], input: DeckCardUpdateInput) {
    setError(null)
    setIsUpdating(true)
    void bulkUpdateDeckCardsMutation({ variables: { deckCardIds, input } })
      .then(onClearSelection)
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : "Could not update selected cards"),
      )
      .finally(() => {
        onRefetch()
        setIsUpdating(false)
      })
  }

  function remove(deckCardIds: string[], onSuccess: () => void) {
    setError(null)
    setIsDeleting(true)
    void bulkDeleteDeckCardsMutation({ variables: { deckCardIds } })
      .then(() => {
        onToast(`${pluralize(deckCardIds.length, "card")} deleted`)
        onClearSelection()
        onSuccess()
      })
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : "Could not delete selected cards"),
      )
      .finally(() => {
        onRefetch()
        setIsDeleting(false)
      })
  }

  function deallocate(deckCardIds: string[]) {
    setError(null)
    setIsDeallocating(true)
    void bulkDeallocateDeckCardsMutation({ variables: { deckCardIds } })
      .then(({ data }) => {
        const count = data?.bulkDeallocateDeckCards?.deckCards.length ?? deckCardIds.length
        onToast(`${pluralize(count, "card")} deallocated`)
        onClearSelection()
      })
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : "Could not deallocate selected cards"),
      )
      .finally(() => {
        onRefetch()
        setIsDeallocating(false)
      })
  }

  return {
    clearError: () => setError(null),
    deallocate,
    error,
    isDeleting,
    isPending: isUpdating || isDeleting || isDeallocating,
    remove,
    update,
  }
}
