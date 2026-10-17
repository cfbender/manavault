import test from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_SET_CATEGORIES,
  deserializeSetCategories,
  filterSets,
  serializeSetCategories,
  shelveSets,
} from "../src/pages/sets/set-list.ts"

const sets = [
  {
    code: "eoe",
    name: "Edge of Eternities",
    releasedAt: "2025-08-01",
    setType: "expansion",
    cardCount: 400,
    ownedCount: 40,
  },
  {
    code: "eoc",
    name: "Edge of Eternities Commander",
    releasedAt: "2025-08-01",
    setType: "commander",
    cardCount: 100,
    ownedCount: 0,
  },
  {
    code: "peoe",
    name: "Edge of Eternities Promos",
    releasedAt: "2025-07-25",
    setType: "promo",
    cardCount: 80,
    ownedCount: 2,
  },
  {
    code: "fdn",
    name: "Foundations",
    releasedAt: "2024-11-15",
    setType: "core",
    cardCount: 500,
    ownedCount: 250,
  },
  {
    code: "mh3",
    name: "Modern Horizons 3",
    releasedAt: "2024-06-14",
    setType: "draft_innovation",
    cardCount: 300,
    ownedCount: 0,
  },
]

const codes = (list) => list.map((set) => set.code)

test("filterSets hides promo sets by default and a search finds any set", () => {
  assert.deepEqual(codes(filterSets(sets, { query: "", categories: DEFAULT_SET_CATEGORIES })), [
    "eoc",
    "eoe",
    "fdn",
    "mh3",
  ])
  assert.deepEqual(
    codes(filterSets(sets, { query: "promos", categories: DEFAULT_SET_CATEGORIES })),
    ["peoe"],
  )
  // Codes match exactly, so EOE does not also find PEOE.
  assert.deepEqual(codes(filterSets(sets, { query: "EOE", categories: [] })), ["eoe"])
})

test("filterSets sorts by completion and narrows to owned sets", () => {
  const owned = filterSets(sets, {
    query: "",
    categories: ["expansion", "promo"],
    ownedOnly: true,
    sort: { field: "owned", direction: "desc" },
  })
  // Foundations is half owned, Edge of Eternities a tenth, the promos 2.5%.
  assert.deepEqual(codes(owned), ["fdn", "eoe", "peoe"])
})

test("shelveSets shelves release order by year and leaves other orders whole", () => {
  const released = filterSets(sets, { query: "", categories: DEFAULT_SET_CATEGORIES })
  assert.deepEqual(
    shelveSets(released, { field: "released", direction: "desc" }).map((shelf) => [
      shelf.label,
      codes(shelf.sets),
    ]),
    [
      ["2025", ["eoc", "eoe"]],
      ["2024", ["fdn", "mh3"]],
    ],
  )
  assert.deepEqual(
    shelveSets(released, { field: "name", direction: "asc" }).map((shelf) => shelf.label),
    [null],
  )
})

test("set categories round-trip through the URL, omitting the default", () => {
  assert.equal(serializeSetCategories(DEFAULT_SET_CATEGORIES), undefined)
  assert.equal(serializeSetCategories(["promo", "expansion"]), "expansion,promo")
  assert.deepEqual(deserializeSetCategories("promo,expansion,bogus"), ["expansion", "promo"])
  assert.deepEqual(deserializeSetCategories(undefined), DEFAULT_SET_CATEGORIES)
})
