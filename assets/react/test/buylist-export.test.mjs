import test from "node:test"
import assert from "node:assert/strict"

import { buylistTotalPrice, deckCardsTotalPrice } from "../src/pages/decks/buylist-export.ts"

test("buylistTotalPrice sums priced entries and counts unpriced quantities", () => {
  const summary = buylistTotalPrice([
    { quantity: 2, totalPriceCents: 500 },
    { quantity: 3, totalPriceCents: null },
    { quantity: 1, totalPriceCents: 125 },
  ])

  assert.deepEqual(summary, { totalCents: 625, unpricedQuantity: 3 })
})

test("deckCardsTotalPrice sums priced main deck entries", () => {
  const summary = deckCardsTotalPrice([
    { quantity: 2, zone: "mainboard", priceCents: 500 },
    { quantity: 1, zone: "commander", priceCents: 125 },
    { quantity: 3, zone: "mainboard", priceCents: null },
    { quantity: 4, zone: "sideboard", priceCents: 1000 },
    { quantity: 5, zone: "maybeboard", priceCents: 1000 },
  ])

  assert.deepEqual(summary, { totalCents: 1125, unpricedQuantity: 3 })
})
