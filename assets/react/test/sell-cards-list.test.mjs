import test from "node:test"
import assert from "node:assert/strict"

import {
  lineMatchesItem,
  selectSellListItems,
  sellListTextForSelections,
  sellListTotalCents,
  sellQuantityValue,
} from "../src/pages/collection/sell-cards-list.ts"

const solRing = {
  id: "sol-ring-nonfoil",
  quantity: 4,
  finish: "nonfoil",
  currentPriceCents: 125,
  priceText: "$1.25",
  printing: {
    setCode: "CMM",
    collectorNumber: "411",
    card: { name: "Sol Ring" },
  },
}

const foilSolRing = {
  ...solRing,
  id: "sol-ring-foil",
  finish: "foil",
}

test("sellListTextForSelections exports selected quantity totals", () => {
  const selections = [{ item: solRing, quantity: 2 }]

  assert.equal(sellListTotalCents(selections), 250)
  assert.equal(
    sellListTextForSelections(selections),
    "2 Sol Ring [CMM #411] nonfoil - $1.25 ea - $2.50\n\nTotal: $2.50",
  )
})

test("selectSellListItems accepts the exported sell list format", () => {
  const text = sellListTextForSelections([{ item: solRing, quantity: 3 }])

  assert.deepEqual(selectSellListItems(text.split(/\r?\n/), [solRing]), {
    "sol-ring-nonfoil": 3,
  })
})

test("selectSellListItems uses finish from exported lines", () => {
  const line = "2 Sol Ring [CMM #411] nonfoil - $1.25 ea - $2.50"

  assert.deepEqual(selectSellListItems([line], [solRing, foilSolRing]), {
    "sol-ring-nonfoil": 2,
  })
  assert.equal(lineMatchesItem(line, foilSolRing), false)
})

test("selectSellListItems clamps pasted quantity to available copies", () => {
  assert.deepEqual(selectSellListItems(["10 Sol Ring [CMM #411] nonfoil"], [solRing]), {
    "sol-ring-nonfoil": 4,
  })
})

test("selectSellListItems does not treat a numeric card name as a quantity", () => {
  const champion = {
    id: "champion",
    quantity: 2,
    finish: "nonfoil",
    currentPriceCents: 100,
    priceText: "$1",
    printing: {
      setCode: "WC",
      collectorNumber: "1996",
      card: { name: "1996 World Champion" },
    },
  }

  assert.deepEqual(selectSellListItems(["1996 World Champion"], [champion]), { champion: 1 })
  assert.deepEqual(selectSellListItems(["2 1996 World Champion"], [champion]), { champion: 2 })
})

test("selectSellListItems still matches card names containing foil", () => {
  const foilNamedCard = {
    id: "foil-card",
    quantity: 1,
    finish: "nonfoil",
    currentPriceCents: 100,
    priceText: "$1",
    printing: {
      setCode: "PCY",
      collectorNumber: "35",
      card: { name: "Foil" },
    },
  }

  assert.deepEqual(selectSellListItems(["Foil"], [foilNamedCard]), { "foil-card": 1 })
})

test("sellQuantityValue normalizes manual quantity input", () => {
  assert.equal(sellQuantityValue(2.8, 4), 2)
  assert.equal(sellQuantityValue(10, 4), 4)
  assert.equal(sellQuantityValue(-1, 4), 0)
  assert.equal(sellQuantityValue(Number.NaN, 4), 0)
})
