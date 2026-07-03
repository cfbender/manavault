import test from "node:test"
import assert from "node:assert/strict"

import { matchDeckCardsToNames, parseSelectListNames } from "../src/pages/decks/deck-select-list.ts"

function deckCard(id, name) {
  return { id, card: { name } }
}

test("parses names from decklist-style lines", () => {
  const names = parseSelectListNames(
    [
      "Commander",
      "1 Sol Ring (LEA) 232 *F*",
      "",
      "Sideboard:",
      "2x Negate # cheap counter",
      "SB: 1 Arcane Signet",
      "Fabled Passage [BLB]",
    ].join("\n"),
  )

  assert.deepEqual(names, ["Sol Ring", "Negate", "Arcane Signet", "Fabled Passage"])
})

test("deduplicates repeated names case-insensitively", () => {
  const names = parseSelectListNames("1 Sol Ring\n4 sol ring\nSOL RING")

  assert.deepEqual(names, ["Sol Ring"])
})

test("bare card names parse without a quantity prefix", () => {
  assert.deepEqual(parseSelectListNames("Sol Ring\nNegate"), ["Sol Ring", "Negate"])
})

test("matches deck cards by normalized name across zones", () => {
  const deckCards = [deckCard("a", "Sol Ring"), deckCard("b", "Sol Ring"), deckCard("c", "Negate")]

  const result = matchDeckCardsToNames(deckCards, ["sol ring", "Counterspell"])

  assert.deepEqual(result.matchedIds, ["a", "b"])
  assert.deepEqual(result.unmatched, ["Counterspell"])
})

test("matches double-faced cards by front face or full name", () => {
  const deckCards = [deckCard("a", "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki")]

  assert.deepEqual(matchDeckCardsToNames(deckCards, ["Fable of the Mirror-Breaker"]).matchedIds, [
    "a",
  ])
  assert.deepEqual(
    matchDeckCardsToNames(deckCards, ["Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"])
      .matchedIds,
    ["a"],
  )
})

test("deck cards without a card name never match", () => {
  const result = matchDeckCardsToNames([{ id: "a", card: null }], ["Sol Ring"])

  assert.deepEqual(result.matchedIds, [])
  assert.deepEqual(result.unmatched, ["Sol Ring"])
})
