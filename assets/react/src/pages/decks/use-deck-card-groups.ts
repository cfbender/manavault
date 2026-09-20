import { useMemo, useState } from "react"

import { groupDeckCards, type DeckGroupBy } from "../../lib/deck-grouping"
import { isValidCommanderPair } from "./commander-pairing"
import { compareDeckCards } from "./deck-card-model"
import type { DeckCardEntry, DeckCustomTag } from "./deck-types"

export function useDeckCardGroups({
  deckCards,
  deckTags,
}: {
  deckCards: DeckCardEntry[]
  deckTags: DeckCustomTag[]
}) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("theme")
  const stackCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone !== "considering"),
    [deckCards],
  )
  const consideringCards = useMemo(
    () => deckCards.filter((deckCard) => deckCard.zone === "considering").sort(compareDeckCards),
    [deckCards],
  )
  const groupedCards = useMemo(
    () => groupDeckCards(stackCards, groupBy, deckTags),
    [deckTags, groupBy, stackCards],
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
    groupedCards,
    partnerCandidateIds,
    selectionCardIds,
    setGroupBy,
  }
}
