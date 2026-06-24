import test from "node:test"
import assert from "node:assert/strict"

import { buylistTotalPrice } from "../src/pages/decks/buylist-export.ts"

test("buylistTotalPrice sums priced entries and counts unpriced quantities", () => {
  const summary = buylistTotalPrice([
    { quantity: 2, totalPriceCents: 500 },
    { quantity: 3, totalPriceCents: null },
    { quantity: 1, totalPriceCents: 125 },
  ])

  assert.deepEqual(summary, { totalCents: 625, unpricedQuantity: 3 })
})
