import test from "node:test"
import assert from "node:assert/strict"

import {
  allocationFinishCounts,
  finishLabel,
  isFoilFinish,
} from "../src/pages/decks/printing-labels.ts"

function allocationEntry(quantity, finish) {
  return {
    quantity,
    item: { finish },
  }
}

test("allocationFinishCounts summarizes allocated quantities by finish", () => {
  assert.deepEqual(
    allocationFinishCounts([
      allocationEntry(2, "foil"),
      allocationEntry(1, "nonfoil"),
      allocationEntry(3, "etched"),
      allocationEntry(1, null),
    ]),
    [
      { finish: "nonfoil", label: "Nonfoil", quantity: 2 },
      { finish: "foil", label: "Foil", quantity: 2 },
      { finish: "etched", label: "Etched", quantity: 3 },
    ],
  )
})

test("finish helpers identify foil statuses", () => {
  assert.equal(finishLabel(null), "Nonfoil")
  assert.equal(finishLabel("foil"), "Foil")
  assert.equal(finishLabel("etched"), "Etched")
  assert.equal(isFoilFinish("nonfoil"), false)
  assert.equal(isFoilFinish("foil"), true)
  assert.equal(isFoilFinish("etched"), true)
})
