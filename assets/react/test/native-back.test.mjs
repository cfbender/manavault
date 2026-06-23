import test from "node:test"
import assert from "node:assert/strict"

import { nativeBackAction } from "../src/lib/native-back.ts"

test("nativeBackAction minimizes on home even with a back stack", () => {
  assert.equal(nativeBackAction({ canGoBack: true }, "/", 2), "minimize")
})

test("nativeBackAction routes deck details to the deck list", () => {
  assert.equal(nativeBackAction({ canGoBack: true }, "/decks/abc123", 2), "decks")
})

test("nativeBackAction preserves browser history behavior on other routes", () => {
  assert.equal(nativeBackAction({ canGoBack: true }, "/collection", 1), "back")
  assert.equal(nativeBackAction({ canGoBack: false }, "/collection", 2), "back")
  assert.equal(nativeBackAction({ canGoBack: false }, "/decks", 2), "back")
  assert.equal(nativeBackAction({ canGoBack: false }, "/decks/abc123/playtest", 2), "back")
})

test("nativeBackAction minimizes at the first app entry", () => {
  assert.equal(nativeBackAction({ canGoBack: false }, "/collection", 1), "minimize")
})
