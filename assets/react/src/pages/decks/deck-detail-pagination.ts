import type { DeckQuery } from "../../gql/graphql"

export function mergeDeckCardsPage(
  previous: DeckQuery,
  fetchMoreResult: DeckQuery | undefined,
): DeckQuery {
  const previousDeck = previous.deck
  const nextConnection = fetchMoreResult?.deck?.deckCards
  const previousConnection = previousDeck?.deckCards
  if (!nextConnection || !previousConnection || !previousDeck) return fetchMoreResult ?? previous

  return {
    ...previous,
    deck: {
      ...previousDeck,
      deckCards: {
        ...nextConnection,
        edges: [...(previousConnection.edges || []), ...(nextConnection.edges || [])],
      },
    },
  }
}
