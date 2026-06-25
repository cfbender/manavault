import test from "node:test"
import assert from "node:assert/strict"

import { hasMainboardAllocationAvailable } from "../src/pages/decks/deck-allocation-model.ts"

function deckCard(zone, available, allocated, required = 1) {
  return {
    zone,
    allocationStatus: {
      available,
      allocated,
      required,
    },
  }
}

test("hasMainboardAllocationAvailable only considers unallocated mainboard cards", () => {
  assert.equal(
    hasMainboardAllocationAvailable([
      deckCard("sideboard", 1, 0),
      deckCard("maybeboard", 1, 0),
      deckCard("commander", 1, 0),
    ]),
    false,
  )

  assert.equal(
    hasMainboardAllocationAvailable([deckCard("mainboard", 0, 0), deckCard("mainboard", 1, 1)]),
    false,
  )

  assert.equal(hasMainboardAllocationAvailable([deckCard("mainboard", 1, 0)]), true)
})
