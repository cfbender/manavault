import test from "node:test"
import assert from "node:assert/strict"

import { partitionDecksByArchive } from "../src/pages/decks/deck-types.ts"

function deck(name, status) {
  return {
    id: name,
    name,
    format: "commander",
    status,
    shareToken: null,
    coverImageUrl: null,
    commanderColorIdentity: null,
    cardCount: 0,
    legality: { status: "legal", issues: [] },
  }
}

test("deck archive partition keeps active decks separate from archived decklists", () => {
  const { activeDecks, archivedDecks } = partitionDecksByArchive([
    deck("Active", "active"),
    deck("Retired", "archived"),
    deck("Brewing", "brewing"),
  ])

  assert.deepEqual(
    activeDecks.map((entry) => entry.name),
    ["Active", "Brewing"],
  )
  assert.deepEqual(
    archivedDecks.map((entry) => entry.name),
    ["Retired"],
  )
})
