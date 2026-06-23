import test from "node:test"
import assert from "node:assert/strict"

import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
  decodeCollectionFilters,
  encodeCollectionFilters,
  combineCollectionQueries,
  countActiveCollectionFilters,
  EMPTY_COLLECTION_FILTERS,
} from "../src/lib/collection-filters.ts"

test("buildCollectionFilterQuery quotes and combines structured predicates", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.name = "Lightning Bolt"
  filters.typeLine = "instant (spell)"
  filters.colors = ["r"]
  filters.identityOperator = ">="
  filters.identity = ["r", "g"]
  filters.rarities = ["rare", "mythic"]
  filters.finish = "foil"
  filters.priceUsd = "2.50"

  assert.equal(
    buildCollectionFilterQuery(filters),
    'name:"Lightning Bolt" type:"instant (spell)" c:r id>=rg (rarity:rare or rarity:mythic) is:foil usd>=2.50',
  )
})

test("combineCollectionQueries trims empty parts and scopes each clause", () => {
  assert.equal(
    combineCollectionQueries(" dragon ", "", "type:creature"),
    "(dragon) (type:creature)",
  )
})

test("countActiveCollectionFilters ignores default operators and clone isolates arrays", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.colors = ["u"]
  filters.rarities = ["common"]

  const copy = cloneCollectionFilters(filters)
  copy.colors.push("b")
  copy.rarities.push("rare")

  assert.equal(countActiveCollectionFilters(filters), 2)
  assert.deepEqual(filters.colors, ["u"])
  assert.deepEqual(filters.rarities, ["common"])
})

test("collection filter search params round trip active filters", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.name = " Lightning Bolt "
  filters.colors = ["r"]
  filters.identityOperator = "<="
  filters.identity = ["r", "g"]
  filters.finish = "foil"
  filters.priceOperator = "<"
  filters.priceUsd = "2.50"

  const encoded = encodeCollectionFilters(filters)
  assert.equal(typeof encoded, "string")

  assert.deepEqual(decodeCollectionFilters(encoded), {
    ...EMPTY_COLLECTION_FILTERS,
    name: "Lightning Bolt",
    colors: ["r"],
    identityOperator: "<=",
    identity: ["r", "g"],
    finish: "foil",
    priceOperator: "<",
    priceUsd: "2.50",
  })
})

test("collection filter search params drop empty and invalid filters", () => {
  assert.equal(encodeCollectionFilters(EMPTY_COLLECTION_FILTERS), undefined)

  assert.deepEqual(
    decodeCollectionFilters(
      JSON.stringify({
        colors: ["x", "u", "u"],
        rarities: ["common", "bonus"],
        finish: "invalid",
        manaValue: " 3 ",
        manaValueOperator: "<=",
      }),
    ),
    {
      ...EMPTY_COLLECTION_FILTERS,
      colors: ["u"],
      rarities: ["common"],
      manaValue: "3",
      manaValueOperator: "<=",
    },
  )
})
