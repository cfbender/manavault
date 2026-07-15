import test from "node:test"
import assert from "node:assert/strict"

import {
  edhrecCardUrl,
  mtgStocksAutocompleteUrl,
  mtgStocksCardUrl,
  mtgStocksPrintUrl,
  scryfallCardUrl,
} from "../src/pages/cards/card-links.ts"

test("scryfallCardUrl links directly to a Scryfall card id", () => {
  assert.equal(
    scryfallCardUrl({ name: "Fury Sliver", scryfallId: "0000579f-7b35-4ed3-b44c-db2a538066fe" }),
    "https://scryfall.com/card/0000579f-7b35-4ed3-b44c-db2a538066fe",
  )
})

test("scryfallCardUrl falls back to an exact card name search", () => {
  const url = new URL(scryfallCardUrl({ name: "Black Lotus", scryfallId: null }))

  assert.equal(url.origin, "https://scryfall.com")
  assert.equal(url.pathname, "/search")
  assert.equal(url.searchParams.get("q"), '!"Black Lotus"')
})

test("edhrecCardUrl links to the card's EDHREC slug", () => {
  assert.equal(
    edhrecCardUrl({ name: "Gonti, Lord of Luxury" }),
    "https://edhrec.com/cards/gonti-lord-of-luxury",
  )
})

test("mtgStocksCardUrl links to MTGStocks with the card name", () => {
  const url = new URL(mtgStocksCardUrl({ name: "Gonti, Lord of Luxury" }))

  assert.equal(url.origin, "https://www.mtgstocks.com")
  assert.equal(url.pathname, "/")
  assert.equal(url.searchParams.get("q"), "Gonti, Lord of Luxury")
})

test("MTGStocks lookup URLs encode names and resolved print slugs", () => {
  assert.equal(
    mtgStocksAutocompleteUrl({ name: "Gonti, Lord of Luxury" }),
    "https://api.mtgstocks.com/search/autocomplete/Gonti%2C%20Lord%20of%20Luxury",
  )
  assert.equal(
    mtgStocksPrintUrl("15770-black-lotus"),
    "https://www.mtgstocks.com/prints/15770-black-lotus",
  )
})
