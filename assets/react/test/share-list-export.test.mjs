import test from "node:test"
import assert from "node:assert/strict"

import { shareListText } from "../src/pages/trade/share-list-export.ts"

test("shareListText renders printing and finish segments when present", () => {
  const text = shareListText([
    {
      cardName: "Lightning Bolt",
      quantity: 2,
      setCode: "lea",
      collectorNumber: "161",
      finish: "foil",
    },
    { cardName: "Aang's Journey", quantity: 1, setCode: "tla", collectorNumber: "5" },
  ])

  assert.equal(text, "2x Lightning Bolt (LEA) 161 *F*\n1x Aang's Journey (TLA) 5")
})

test("shareListText omits printing info for generic wants", () => {
  assert.equal(shareListText([{ cardName: "Ancient Tomb", quantity: 1 }]), "1x Ancient Tomb")
})

test("shareListText marks etched finishes and clamps quantity to at least 1", () => {
  assert.equal(
    shareListText([{ cardName: "Sol Ring", quantity: 0, setCode: "c21", finish: "etched" }]),
    "1x Sol Ring (C21) *E*",
  )
})

test("shareListText drops entries with blank names", () => {
  assert.equal(shareListText([{ cardName: "   ", quantity: 3 }]), "")
})
