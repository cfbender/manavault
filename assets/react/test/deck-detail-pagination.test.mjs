import assert from "node:assert/strict"
import test from "node:test"

import { mergeDeckCardsPage } from "../src/pages/decks/deck-detail-pagination.ts"

function deckPage(edges, { endCursor, hasNextPage }) {
  return {
    deck: {
      id: "deck-1",
      deckCards: {
        edges,
        pageInfo: { endCursor, hasNextPage },
      },
    },
  }
}

test("deck detail pagination appends every fetched page while adopting the latest page cursor", () => {
  const firstPage = deckPage([{ cursor: "a", node: { id: "one" } }], {
    endCursor: "a",
    hasNextPage: true,
  })
  const secondPage = deckPage([{ cursor: "b", node: { id: "two" } }], {
    endCursor: "b",
    hasNextPage: false,
  })

  const merged = mergeDeckCardsPage(firstPage, secondPage)

  assert.deepEqual(
    merged.deck.deckCards.edges.map((edge) => edge.node.id),
    ["one", "two"],
  )
  assert.deepEqual(merged.deck.deckCards.pageInfo, { endCursor: "b", hasNextPage: false })
  assert.deepEqual(firstPage.deck.deckCards.edges.map((edge) => edge.node.id), ["one"])
})

test("deck detail pagination preserves the loaded page when a fetch returns no connection", () => {
  const previous = deckPage([{ cursor: "a", node: { id: "one" } }], {
    endCursor: "a",
    hasNextPage: true,
  })

  assert.equal(mergeDeckCardsPage(previous, undefined), previous)
})
