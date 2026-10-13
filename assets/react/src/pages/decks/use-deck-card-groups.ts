import { useMemo, useState } from "react"

import { groupDeckCards, type DeckGroupBy } from "../../lib/deck-grouping"
import { useDeckCardRoles } from "./use-deck-card-roles"
import { isValidCommanderPair } from "./commander-pairing"
import { compareDeckCards } from "./deck-card-model"
import type { DeckCardEntry, DeckCustomTag } from "./deck-types"

export function useDeckCardGroups({
  analyzedAt,
  deckCards,
  deckId,
  deckTags,
  shareMode,
}: {
  analyzedAt: string | null | undefined
  deckCards: DeckCardEntry[]
  deckId: string
  deckTags: DeckCustomTag[]
  shareMode: boolean
}) {
  const [groupBy, setGroupBy] = useState<DeckGroupBy>("theme")
  const roles = useDeckCardRoles({
    analyzedAt,
    deckCards,
    deckId,
    enabled: groupBy === "role" && !shareMode,
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

  // Shown in place of AI roles once the deck is known to have none.
  const rolesNotice =
    groupBy === "role" && roles.loaded && !roles.roles?.categories.length
      ? "Run an AI analysis to sort this deck into roles. Showing themes for now."
      : null

  return {
    consideringCards,
    groupBy,
    rolesNotice,
    groupedCards,
    partnerCandidateIds,
    selectionCardIds,
    setGroupBy,
  }
}
