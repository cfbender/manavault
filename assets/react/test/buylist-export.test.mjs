import test from "node:test"
import assert from "node:assert/strict"

import { buylistTotalPrice, deckMissingCardsTotalPrice } from "../src/pages/decks/buylist-export.ts"

test("buylistTotalPrice sums priced entries and counts unpriced quantities", () => {
  const summary = buylistTotalPrice([
    { quantity: 2, totalPriceCents: 500 },
    { quantity: 3, totalPriceCents: null },
    { quantity: 1, totalPriceCents: 125 },
  ])

  assert.deepEqual(summary, { totalCents: 625, unpricedQuantity: 3 })
})

test("deckMissingCardsTotalPrice sums only unaccounted main deck entries", () => {
  const summary = deckMissingCardsTotalPrice([
    deckCard({ quantity: 4, zone: "mainboard", missing: 2, priceCents: 500 }),
    deckCard({ quantity: 1, zone: "commander", missing: 1, priceCents: 125 }),
    deckCard({ quantity: 3, zone: "mainboard", missing: 2, priceCents: null }),
    deckCard({ quantity: 1, zone: "mainboard", missing: 1, priceCents: 700, tag: "getting" }),
    deckCard({ quantity: 4, zone: "sideboard", missing: 4, priceCents: 1000 }),
    deckCard({ quantity: 5, zone: "maybeboard", missing: 5, priceCents: 1000 }),
    deckCard({ quantity: 2, zone: "mainboard", missing: 0, priceCents: 999 }),
  ])

  assert.deepEqual(summary, { totalCents: 1125, unpricedQuantity: 2 })
})

function deckCard({ quantity, zone, missing, priceCents, tag = null }) {
  return {
    quantity,
    zone,
    tag,
    priceCents,
    allocationStatus: {
      missing,
    },
  }
}
