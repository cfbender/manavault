import { useMutation } from "@apollo/client/react"
import { useEffect, useMemo, useState } from "react"

import type { DeckCardRoles } from "../../lib/deck-grouping"
import { AssignDeckCardCategoriesDocument } from "./deck-detail-documents"
import type { DeckCardEntry } from "./deck-types"

/**
 * The deck's AI card categories and each card's assigned category. While
 * enabled, asks the server to assign categories whenever the deck's cards or
 * analysis change; the server only sends new cards to the decision model.
 */
export function useDeckCardRoles({
  analyzedAt,
  deckCards,
  deckId,
  enabled,
}: {
  analyzedAt: string | null | undefined
  deckCards: DeckCardEntry[]
  deckId: string
  enabled: boolean
}) {
  const [assign] = useMutation(AssignDeckCardCategoriesDocument)
  const [roles, setRoles] = useState<DeckCardRoles | null>(null)
  const [loaded, setLoaded] = useState(false)
  const cardKey = useMemo(
    () =>
      [...new Set(deckCards.map((deckCard) => deckCard.card?.oracleId).filter(Boolean))]
        .sort()
        .join(","),
    [deckCards],
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    assign({ variables: { id: deckId } })
      .then(({ data }) => {
        if (cancelled) return
        const result = data?.assignDeckCardCategories
        setRoles(
          result
            ? {
                categories: result.categories.map((category) => category.name),
                byOracleId: new Map(result.cards.map((card) => [card.oracleId, card.category])),
              }
            : null,
        )
        setLoaded(true)
      })
      // Roles are an enhancement; on failure the grouping shows themes.
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [analyzedAt, assign, cardKey, deckId, enabled])

  return { loaded, roles }
}
