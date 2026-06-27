import test from "node:test"
import assert from "node:assert/strict"

import { scryfallCardUrl } from "../src/pages/cards/card-links.ts"

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
