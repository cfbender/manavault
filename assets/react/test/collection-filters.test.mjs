import test from "node:test"
import assert from "node:assert/strict"

import {
  buildCollectionFilterQuery,
  cloneCollectionFilters,
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
