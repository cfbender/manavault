import assert from "node:assert/strict"
import test from "node:test"

import {
  applyTotalSpend,
  importedCardQuantity,
  totalSpendPerCardCents,
} from "../src/pages/collection/import-export-helpers.ts"

function importRow(rowNumber, status, quantity, purchasePriceCents = null) {
  return {
    rowNumber,
    status,
    attrs: { quantity, purchasePriceCents },
    candidates: [],
    printing: null,
  }
}

test("total import spend is divided by exact card quantity and rounded to cents", () => {
  const rows = [
    importRow(1, "exact", 30),
    importRow(2, "exact", 30),
    importRow(3, "unresolved", 10),
  ]

  assert.equal(importedCardQuantity(rows), 60)
  assert.equal(totalSpendPerCardCents(43_900, 60), 732)

  const pricedRows = applyTotalSpend(rows, 43_900)
  assert.equal(pricedRows[0].attrs.purchasePriceCents, 732)
  assert.equal(pricedRows[1].attrs.purchasePriceCents, 732)
  assert.equal(pricedRows[2].attrs.purchasePriceCents, null)
})

test("total import spend handles exact division and no importable cards", () => {
  assert.equal(totalSpendPerCardCents(1_500, 15), 100)
  assert.equal(totalSpendPerCardCents(1_500, 0), null)
})
