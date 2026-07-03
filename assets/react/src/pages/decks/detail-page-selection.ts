import { useEffect, useMemo, useRef, useState } from "react"

import type { DeckCardEntry } from "./deck-types"
import { filterHighlightedDeckCardIds } from "./mana-balance"

export function useDeckDetailSelection(deckCards: DeckCardEntry[], selectionDeckCardIds: string[]) {
  const [isSelectingCards, setIsSelectingCards] = useState(false)
  const [selectedDeckCardIds, setSelectedDeckCardIds] = useState<Set<string>>(() => new Set())
  // Range-selection anchor lives in a ref so it updates synchronously; two
  // shift-clicks in the same frame each see the prior click's anchor rather
  // than a stale render-scoped value.
  const lastSelectedDeckCardIdRef = useRef<string | null>(null)
  const [highlightedDeckCardIds, setHighlightedDeckCardIds] = useState<Set<string> | null>(null)
  const [bulkQuantity, setBulkQuantity] = useState(1)
  const [isDeleteSelectedOpen, setIsDeleteSelectedOpen] = useState(false)
  const [bulkActionError, setBulkActionError] = useState<string | null>(null)
  const [tagError, setTagError] = useState<string | null>(null)
  const selectedDeckCardIdList = useMemo(
    () => Array.from(selectedDeckCardIds),
    [selectedDeckCardIds],
  )
  const selectedDeckCardCount = selectedDeckCardIdList.length
  const isSelectionActive = isSelectingCards || selectedDeckCardCount > 0
  const allDeckCardsSelected = deckCards.length > 0 && selectedDeckCardCount === deckCards.length

  useEffect(() => {
    const availableIds = new Set(deckCards.map((deckCard) => deckCard.id))

    setSelectedDeckCardIds((current) => {
      const selectedIds = Array.from(current).filter((deckCardId) => availableIds.has(deckCardId))
      if (selectedIds.length === current.size) return current
      return new Set(selectedIds)
    })
    if (lastSelectedDeckCardIdRef.current && !availableIds.has(lastSelectedDeckCardIdRef.current)) {
      lastSelectedDeckCardIdRef.current = null
    }
    setHighlightedDeckCardIds((current) => filterHighlightedDeckCardIds(current, availableIds))
  }, [deckCards])

  function toggleDeckCardSelected(deckCardId: string, selectRange = false) {
    const rangeStart = lastSelectedDeckCardIdRef.current

    setSelectedDeckCardIds((current) => {
      const next = new Set(current)

      if (selectRange && rangeStart) {
        const startIndex = selectionDeckCardIds.indexOf(rangeStart)
        const endIndex = selectionDeckCardIds.indexOf(deckCardId)

        if (startIndex >= 0 && endIndex >= 0) {
          const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
          for (const id of selectionDeckCardIds.slice(from, to + 1)) next.add(id)
        } else {
          next.add(deckCardId)
        }
      } else if (next.has(deckCardId)) {
        next.delete(deckCardId)
      } else {
        next.add(deckCardId)
      }

      return next
    })
    lastSelectedDeckCardIdRef.current = deckCardId
  }

  function selectDeckCardIds(deckCardIds: string[]) {
    setSelectedDeckCardIds((current) => {
      const next = new Set(current)
      for (const deckCardId of deckCardIds) next.add(deckCardId)
      return next
    })
  }

  function selectAllDeckCards() {
    setSelectedDeckCardIds(new Set(selectionDeckCardIds))
    lastSelectedDeckCardIdRef.current =
      selectionDeckCardIds[selectionDeckCardIds.length - 1] || null
  }

  function clearSelectedDeckCards() {
    setSelectedDeckCardIds(new Set())
    lastSelectedDeckCardIdRef.current = null
  }

  return {
    allDeckCardsSelected,
    bulkActionError,
    bulkQuantity,
    clearSelectedDeckCards,
    highlightedDeckCardIds,
    isDeleteSelectedOpen,
    isSelectingCards,
    isSelectionActive,
    selectedDeckCardCount,
    selectedDeckCardIdList,
    selectedDeckCardIds,
    selectAllDeckCards,
    selectDeckCardIds,
    setBulkActionError,
    setBulkQuantity,
    setHighlightedDeckCardIds,
    setIsDeleteSelectedOpen,
    setIsSelectingCards,
    setTagError,
    tagError,
    toggleDeckCardSelected,
  }
}
