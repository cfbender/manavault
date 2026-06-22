import test from "node:test"
import assert from "node:assert/strict"

import { nativeAppPath, parseNativeRoute } from "../src/lib/native-open.ts"

test("nativeAppPath normalizes manavault collection URLs", () => {
  assert.equal(
    nativeAppPath("manavault://collection?importFile=true"),
    "/collection?importFile=true",
  )
  assert.equal(
    nativeAppPath("manavault:///collection?importFile=true"),
    "/collection?importFile=true",
  )
})

test("nativeAppPath normalizes manavault share deck URLs", () => {
  assert.equal(nativeAppPath("manavault://share/decks/token"), "/share/decks/token")
})

test("nativeAppPath accepts hosted collection URLs", () => {
  assert.equal(
    nativeAppPath("https://manavault.cfb.dev/collection?importFile=true"),
    "/collection?importFile=true",
  )
  assert.equal(
    nativeAppPath("https://www.manavault.cfb.dev/collection?importFile=true"),
    "/collection?importFile=true",
  )
})

test("nativeAppPath accepts current-origin self-hosted URLs", () => {
  assert.equal(
    nativeAppPath("http://vault.local:4000/collection?importFile=true", "http://vault.local:4000"),
    "/collection?importFile=true",
  )
})

test("nativeAppPath rejects external URLs", () => {
  assert.equal(nativeAppPath("https://example.com/collection?importFile=true"), null)
})

test("parseNativeRoute parses collection import route", () => {
  assert.deepEqual(parseNativeRoute("/collection?importFile=true"), {
    to: "/collection",
    search: { importFile: true },
  })
})

test("parseNativeRoute parses supported native routes", () => {
  assert.deepEqual(parseNativeRoute("/"), { to: "/" })
  assert.deepEqual(parseNativeRoute("/cards?q=dragon"), {
    to: "/cards",
    search: { q: "dragon" },
  })
  assert.deepEqual(parseNativeRoute("/cards/card-1?q=dragon"), {
    to: "/cards/$id",
    params: { id: "card-1" },
    search: { q: "dragon" },
  })
  assert.deepEqual(parseNativeRoute("/decks"), { to: "/decks" })
  assert.deepEqual(parseNativeRoute("/decks/deck-1"), {
    to: "/decks/$id",
    params: { id: "deck-1" },
  })
  assert.deepEqual(parseNativeRoute("/decks/deck-1/playtest"), {
    to: "/decks/$id/playtest",
    params: { id: "deck-1" },
  })
  assert.deepEqual(parseNativeRoute("/settings"), { to: "/settings" })
  assert.deepEqual(parseNativeRoute("/share/decks/token"), {
    to: "/share/decks/$token",
    params: { token: "token" },
  })
})

test("parseNativeRoute falls back to home for unsupported paths", () => {
  assert.deepEqual(parseNativeRoute("/collection/new"), { to: "/" })
  assert.deepEqual(parseNativeRoute("https://example.com/settings"), { to: "/" })
})
