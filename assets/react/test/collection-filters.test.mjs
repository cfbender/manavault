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

test("color filters default to Scryfall's c: and id: meanings", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.colors = ["w", "u"]
  filters.identity = ["w", "u", "b"]
  assert.equal(buildCollectionFilterQuery(filters), "c:wu id:wub")

  filters.colorOperator = "="
  filters.identityOperator = ">="
  assert.equal(buildCollectionFilterQuery(filters), "c=wu id>=wub")

  filters.colorOperator = "<="
  filters.identityOperator = "="
  assert.equal(buildCollectionFilterQuery(filters), "c<=wu id=wub")
  assert.deepEqual(decodeCollectionFilters(encodeCollectionFilters(filters)), filters)
})

test("color filters saved before the Scryfall defaults keep meaning exactly", () => {
  for (const legacy of [{}, { colorOperator: ":", identityOperator: ":" }]) {
    const decoded = decodeCollectionFilters(
      JSON.stringify({ colors: ["r"], identity: ["r", "g"], ...legacy }),
    )
    assert.equal(decoded.colorOperator, "=")
    assert.equal(decoded.identityOperator, "=")
    assert.equal(buildCollectionFilterQuery(decoded), "c=r id=rg")
  }
  // A saved default round trips as the new default.
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.colors = ["r"]
  assert.deepEqual(decodeCollectionFilters(encodeCollectionFilters(filters)), filters)
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
      colorOperator: "=",
      rarities: ["common"],
      manaValue: "3",
      manaValueOperator: "<=",
    },
  )
})

test("allocation filter emits is: syntax, counts as active, and round trips", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.allocation = "allocated"

  assert.equal(buildCollectionFilterQuery(filters), "is:allocated")
  assert.equal(countActiveCollectionFilters(filters), 1)
  assert.deepEqual(decodeCollectionFilters(encodeCollectionFilters(filters)), filters)

  filters.allocation = "unallocated"
  assert.equal(buildCollectionFilterQuery(filters), "is:unallocated")

  assert.deepEqual(
    decodeCollectionFilters(JSON.stringify({ allocation: "invalid" })),
    EMPTY_COLLECTION_FILTERS,
  )
})

test("multiple sets emit an OR group and single sets stay bare", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.sets = ["lea"]
  assert.equal(buildCollectionFilterQuery(filters), "set:lea")

  filters.sets = ["lea", "leb", "Time Spiral"]
  assert.equal(buildCollectionFilterQuery(filters), '(set:lea or set:leb or set:"Time Spiral")')
  assert.equal(countActiveCollectionFilters(filters), 1)
  assert.deepEqual(decodeCollectionFilters(encodeCollectionFilters(filters)), filters)
})

test("legacy single set filters decode into the sets list", () => {
  assert.deepEqual(decodeCollectionFilters(JSON.stringify({ set: " lea " })), {
    ...EMPTY_COLLECTION_FILTERS,
    sets: ["lea"],
  })
  assert.deepEqual(decodeCollectionFilters(JSON.stringify({ sets: ["lea", "LEA", "", 3] })), {
    ...EMPTY_COLLECTION_FILTERS,
    sets: ["lea"],
  })
})

test("purchase price and added date ranges emit bounded predicates", () => {
  const filters = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  filters.purchasePriceMin = "1"
  filters.purchasePriceMax = "20.50"
  filters.addedFrom = "2026-09-01"
  filters.addedTo = "2026-09-27"

  assert.equal(
    buildCollectionFilterQuery(filters),
    "paid>=1 paid<=20.50 added>=2026-09-01 added<=2026-09-27",
  )
  assert.equal(countActiveCollectionFilters(filters), 2)
  assert.deepEqual(decodeCollectionFilters(encodeCollectionFilters(filters)), filters)

  const openEnded = cloneCollectionFilters(EMPTY_COLLECTION_FILTERS)
  openEnded.addedFrom = "2026-09-20"
  openEnded.purchasePriceMax = "5"
  assert.equal(buildCollectionFilterQuery(openEnded), "paid<=5 added>=2026-09-20")
})
