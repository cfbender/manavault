import { useMemo, useState } from "react"

import { deckGroupOptions, groupDeckCards, type DeckGroupBy } from "../../lib/deck-grouping"
import { useDeckCardRoles } from "./use-deck-card-roles"
import { isValidCommanderPair } from "./commander-pairing"
import { compareDeckCards } from "./deck-card-model"
import type { DeckCardEntry, DeckCustomTag } from "./deck-types"

export function useDeckCardGroups({
  analyzedAt,
  deckCards,
  deckId,
  deckTags,
  hasAiTags,
}: {
  analyzedAt: string | null | undefined
  deckCards: DeckCardEntry[]
  deckId: string
  deckTags: DeckCustomTag[]
  /** The deck has AI card categories and the viewer can assign them. */
  hasAiTags: boolean
}) {
  // Until the owner picks a grouping, decks with AI tags open grouped by them.
  const [chosenGroupBy, setGroupBy] = useState<DeckGroupBy | null>(null)
  const preferred = chosenGroupBy ?? (hasAiTags ? "role" : "theme")
  const groupBy: DeckGroupBy = preferred === "role" && !hasAiTags ? "theme" : preferred
  const groupOptions = useMemo(() => deckGroupOptions(hasAiTags), [hasAiTags])
  const roles = useDeckCardRoles({
    analyzedAt,
    deckCards,
    deckId,
    enabled: groupBy === "role",
  })
  const stackCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone !== "considering"),
    [deckCards],
  )
  const consideringCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone === "considering").sort(compareDeckCards),
    [deckCards],
  )
  const groupedCards = useMemo(
    () => groupDeckCards(stackCards, groupBy, deckTags, roles.roles),
    [deckTags, groupBy, roles.roles, stackCards],
  )
  const partnerCandidateIds = useMemo(() => {
    const commanders = deckCards.filter((deckCard) => deckCard.zone === "commander")
    const commanderCard = commanders.length === 1 ? commanders[0].card : null
    if (!commanderCard) return new Set<string>()

    return new Set(
      deckCards
        .filter(
          (deckCard) =>
            deckCard.zone !== "commander" &&
            deckCard.card &&
            isValidCommanderPair(deckCard.card, commanderCard),
        )
        .map(({ id }) => id),
    )
  }, [deckCards])
  const selectionCardIds = useMemo(
    () => [
      ...new Set(groupedCards.flatMap((group) => group.cards.map(({ id }) => id))),
      ...consideringCards.map(({ id }) => id),
    ],
    [consideringCards, groupedCards],
  )

  return {
    consideringCards,
    groupBy,
    groupOptions,
    groupedCards,
    partnerCandidateIds,
    selectionCardIds,
    setGroupBy,
  }
}
