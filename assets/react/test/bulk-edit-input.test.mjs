import test from "node:test"
import assert from "node:assert/strict"

import { buildBulkCollectionItemUpdateInput } from "../src/pages/collection/bulk-edit-input.ts"

test("bulk edit input includes only checked fields", () => {
  assert.deepEqual(
    buildBulkCollectionItemUpdateInput({
      finish: "foil",
      purchasePrice: "12.34",
      updateFinish: true,
      updatePurchasePrice: false,
    }),
    { ok: true, input: { finish: "foil" } },
  )

  assert.deepEqual(
    buildBulkCollectionItemUpdateInput({
      finish: "nonfoil",
      purchasePrice: "$1,234.50",
      updateFinish: false,
      updatePurchasePrice: true,
    }),
    { ok: true, input: { purchasePriceCents: 123450 } },
  )
})

test("bulk edit input validates selected purchase price", () => {
  assert.deepEqual(
    buildBulkCollectionItemUpdateInput({
      finish: "nonfoil",
      purchasePrice: "",
      updateFinish: false,
      updatePurchasePrice: true,
    }),
    { ok: true, input: { purchasePriceCents: null } },
  )

  assert.deepEqual(
    buildBulkCollectionItemUpdateInput({
      finish: "nonfoil",
      purchasePrice: "12.345",
      updateFinish: false,
      updatePurchasePrice: true,
    }),
    { ok: false, error: "Purchase price must be a dollar amount" },
  )
})

test("bulk edit input requires at least one checked field", () => {
  assert.deepEqual(
    buildBulkCollectionItemUpdateInput({
      finish: "nonfoil",
      purchasePrice: "12.34",
      updateFinish: false,
      updatePurchasePrice: false,
    }),
    { ok: false, error: "Choose at least one field to update" },
  )
})
