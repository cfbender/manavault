import assert from "node:assert/strict"
import test from "node:test"

import {
  updateDeckCardCustomTagsInDeckQuery,
  updateDeckCardTagsInDeckQuery,
} from "../src/pages/decks/deck-query-cache.ts"

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

  const result = updateDeckCardTagsInDeckQuery(data, [{ id: "deck-card-1", tag: "getting" }])

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

function deckCardWithTags(id, tagIds = []) {
  return { id, quantity: 1, zone: "mainboard", finish: null, tag: null, tagIds }
}

function customTagsDeckQuery(nodes, tags) {
  return {
    deck: {
      id: "deck-1",
      name: "Test Deck",
      tags,
      deckCards: {
        pageInfo: { endCursor: null, hasNextPage: false },
        edges: nodes.map((node) => ({ node })),
      },
    },
  }
}

function customTag(id, cardCount) {
  return { id, name: id, color: "blue", targetCount: null, position: 0, cardCount }
}

test("custom tag card patch replaces tagIds by node id and leaves other nodes untouched", () => {
  const patchedNode = deckCardWithTags("deck-card-1", ["ramp"])
  const unrelatedNode = deckCardWithTags("deck-card-2", ["removal"])
  const data = customTagsDeckQuery([patchedNode, unrelatedNode], [customTag("ramp", 1)])
  const unrelatedEdge = data.deck.deckCards.edges[1]

  const result = updateDeckCardCustomTagsInDeckQuery(
    data,
    [{ id: "deck-card-1", tagIds: ["ramp", "draw"] }],
    [],
  )

  assert.deepEqual(result.deck.deckCards.edges[0].node.tagIds, ["ramp", "draw"])
  assert.deepEqual(patchedNode.tagIds, ["ramp"])
  assert.equal(result.deck.deckCards.edges[1], unrelatedEdge)
  assert.equal(result.deck.deckCards.edges[1].node, unrelatedNode)
})

test("custom tag count patch updates deck.tags cardCount by id and leaves unpatched tags", () => {
  const data = customTagsDeckQuery(
    [deckCardWithTags("deck-card-1", ["ramp"])],
    [customTag("ramp", 1), customTag("removal", 3)],
  )

  const result = updateDeckCardCustomTagsInDeckQuery(data, [], [{ id: "ramp", cardCount: 2 }])

  assert.deepEqual(result.deck.tags, [customTag("ramp", 2), customTag("removal", 3)])
  assert.deepEqual(data.deck.tags, [customTag("ramp", 1), customTag("removal", 3)])
})

test("custom tag card and count patches apply together in one call", () => {
  const data = customTagsDeckQuery(
    [deckCardWithTags("deck-card-1", ["ramp"]), deckCardWithTags("deck-card-2", [])],
    [customTag("ramp", 1), customTag("draw", 0)],
  )

  const result = updateDeckCardCustomTagsInDeckQuery(
    data,
    [{ id: "deck-card-2", tagIds: ["draw"] }],
    [
      { id: "ramp", cardCount: 1 },
      { id: "draw", cardCount: 1 },
    ],
  )

  assert.deepEqual(result.deck.deckCards.edges[1].node.tagIds, ["draw"])
  assert.deepEqual(result.deck.tags, [customTag("ramp", 1), customTag("draw", 1)])
})

test("custom tag update with empty patch arrays is a no-op and returns the same data", () => {
  const data = customTagsDeckQuery(
    [deckCardWithTags("deck-card-1", ["ramp"])],
    [customTag("ramp", 1)],
  )

  const result = updateDeckCardCustomTagsInDeckQuery(data, [], [])

  assert.equal(result, data)
})

test("custom tag update returns undefined when data is undefined", () => {
  const result = updateDeckCardCustomTagsInDeckQuery(undefined, [{ id: "x", tagIds: [] }], [])

  assert.equal(result, undefined)
})

test("custom tag update does not mutate the original fixture", () => {
  const originalNode = deckCardWithTags("deck-card-1", ["ramp"])
  const originalTags = [customTag("ramp", 1)]
  const data = customTagsDeckQuery([originalNode], originalTags)

  updateDeckCardCustomTagsInDeckQuery(
    data,
    [{ id: "deck-card-1", tagIds: ["ramp", "draw"] }],
    [{ id: "ramp", cardCount: 5 }],
  )

  assert.deepEqual(originalNode.tagIds, ["ramp"])
  assert.deepEqual(originalTags, [customTag("ramp", 1)])
  assert.equal(data.deck.deckCards.edges[0].node, originalNode)
  assert.equal(data.deck.tags, originalTags)
})
