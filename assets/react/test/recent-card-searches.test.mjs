import test from "node:test"
import assert from "node:assert/strict"

import {
  deserializeRecentCardSearches,
  pushRecentCardSearch,
  RECENT_CARD_SEARCHES_LIMIT,
} from "../src/lib/recent-card-searches.ts"

test("pushRecentCardSearch prepends the trimmed term, most recent first", () => {
  const next = pushRecentCardSearch(["Sol Ring"], "  Lightning Bolt  ")

  assert.deepEqual(next, ["Lightning Bolt", "Sol Ring"])
})

test("pushRecentCardSearch deduplicates case-insensitively and moves the term to the front", () => {
  const next = pushRecentCardSearch(["Sol Ring", "Lightning Bolt", "Mana Crypt"], "lightning bolt")

  assert.deepEqual(next, ["lightning bolt", "Sol Ring", "Mana Crypt"])
})

test("pushRecentCardSearch caps the list at the limit, dropping the oldest entry", () => {
  const full = Array.from({ length: RECENT_CARD_SEARCHES_LIMIT }, (_, index) => `card ${index}`)
  const next = pushRecentCardSearch(full, "new card")

  assert.equal(next.length, RECENT_CARD_SEARCHES_LIMIT)
  assert.equal(next[0], "new card")
  assert.ok(!next.includes(`card ${RECENT_CARD_SEARCHES_LIMIT - 1}`))
})

test("pushRecentCardSearch ignores blank terms", () => {
  const current = ["Sol Ring"]

  assert.equal(pushRecentCardSearch(current, "   "), current)
  assert.equal(pushRecentCardSearch(current, ""), current)
})

test("deserializeRecentCardSearches rejects non-array payloads so storage falls back", () => {
  assert.throws(() => deserializeRecentCardSearches('"Sol Ring"'))
  assert.throws(() => deserializeRecentCardSearches("not json"))
})

test("deserializeRecentCardSearches drops non-string entries and caps the list", () => {
  const raw = JSON.stringify(["Sol Ring", 42, null, "Mana Crypt", "a", "b", "c", "d"])

  assert.deepEqual(deserializeRecentCardSearches(raw), ["Sol Ring", "Mana Crypt", "a", "b", "c"])
})
