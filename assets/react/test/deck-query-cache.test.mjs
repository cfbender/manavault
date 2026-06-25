import assert from "node:assert/strict"
import test from "node:test"

import { updateDeckCardTagsInDeckQuery } from "../src/pages/decks/deck-query-cache.ts"

function deckCard(id, tag = null) {
  return {
    id,
    quantity: 1,
    zone: "mainboard",
    finish: null,
    tag,
  }
}

function deckQuery(nodes) {
  return {
    deck: {
      id: "deck-1",
      name: "Test Deck",
      deckCards: {
        pageInfo: { endCursor: null, hasNextPage: false },
        edges: nodes.map((node) => (node === null ? null : { node })),
      },
    },
  }
}

test("single tag patch preserves unrelated card references", () => {
  const patchedNode = deckCard("deck-card-1")
  const unrelatedNode = deckCard("deck-card-2", "consider_cutting")
  const data = deckQuery([patchedNode, unrelatedNode])
  const patchedEdge = data.deck.deckCards.edges[0]
  const unrelatedEdge = data.deck.deckCards.edges[1]

  const result = updateDeckCardTagsInDeckQuery(data, [
    { id: "deck-card-1", tag: "getting" },
  ])

  assert.notEqual(result, data)
  assert.notEqual(result.deck.deckCards.edges[0], patchedEdge)
  assert.equal(result.deck.deckCards.edges[0].node.tag, "getting")
  assert.equal(patchedNode.tag, null)
  assert.equal(result.deck.deckCards.edges[1], unrelatedEdge)
  assert.equal(result.deck.deckCards.edges[1].node, unrelatedNode)
})

test("bulk tag patch updates multiple nodes", () => {
  const data = deckQuery([
    deckCard("deck-card-1"),
    deckCard("deck-card-2", "consider_cutting"),
    deckCard("deck-card-3"),
  ])

  const result = updateDeckCardTagsInDeckQuery(data, [
    { id: "deck-card-1", tag: "getting" },
    { id: "deck-card-2", tag: "getting" },
  ])

  assert.equal(result.deck.deckCards.edges[0].node.tag, "getting")
  assert.equal(result.deck.deckCards.edges[1].node.tag, "getting")
  assert.equal(result.deck.deckCards.edges[2], data.deck.deckCards.edges[2])
})

test("tag null clears an existing tag", () => {
  const data = deckQuery([deckCard("deck-card-1", "getting")])

  const result = updateDeckCardTagsInDeckQuery(data, [{ id: "deck-card-1", tag: null }])

  assert.equal(result.deck.deckCards.edges[0].node.tag, null)
  assert.equal(data.deck.deckCards.edges[0].node.tag, "getting")
})

test("missing ids are a no-op and return the same data", () => {
  const data = deckQuery([deckCard("deck-card-1", "getting")])

  const result = updateDeckCardTagsInDeckQuery(data, [{ id: "missing", tag: null }])

  assert.equal(result, data)
})

test("currentTag prevents rollback from clobbering a newer tag", () => {
  const data = deckQuery([deckCard("deck-card-1", "consider_cutting")])

  const result = updateDeckCardTagsInDeckQuery(data, [
    { currentTag: "getting", id: "deck-card-1", tag: null },
  ])

  assert.equal(result, data)
  assert.equal(result.deck.deckCards.edges[0].node.tag, "consider_cutting")
})

test("currentTag allows patching a matching tag", () => {
  const data = deckQuery([deckCard("deck-card-1", "getting")])

  const result = updateDeckCardTagsInDeckQuery(data, [
    { currentTag: "getting", id: "deck-card-1", tag: "consider_cutting" },
  ])

  assert.equal(result.deck.deckCards.edges[0].node.tag, "consider_cutting")
})

test("same tag patches are a no-op and return the same data", () => {
  const data = deckQuery([deckCard("deck-card-1", "getting")])

  const result = updateDeckCardTagsInDeckQuery(data, [{ id: "deck-card-1", tag: "getting" }])

  assert.equal(result, data)
})

test("null and missing relay edges are preserved while matching nodes patch", () => {
  const missingNodeEdge = {}
  const data = deckQuery([null, deckCard("deck-card-1", "getting")])
  data.deck.deckCards.edges.splice(1, 0, missingNodeEdge)

  const result = updateDeckCardTagsInDeckQuery(data, [{ id: "deck-card-1", tag: null }])

  assert.equal(result.deck.deckCards.edges[0], null)
  assert.equal(result.deck.deckCards.edges[1], missingNodeEdge)
  assert.equal(result.deck.deckCards.edges[2].node.tag, null)
})

test("missing relay edges are a no-op", () => {
  const data = deckQuery([])
  delete data.deck.deckCards.edges

  const result = updateDeckCardTagsInDeckQuery(data, [{ id: "deck-card-1", tag: "getting" }])

  assert.equal(result, data)
})
