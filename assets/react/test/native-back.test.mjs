import test from "node:test"
import assert from "node:assert/strict"

import { nativeBackAction } from "../src/lib/native-back.ts"

test("nativeBackAction navigates browser history when Capacitor reports a back stack", () => {
  assert.equal(nativeBackAction({ canGoBack: true }, 1), "back")
})

test("nativeBackAction falls back to browser history length for SPA routes", () => {
  assert.equal(nativeBackAction({ canGoBack: false }, 2), "back")
})

test("nativeBackAction minimizes at the first app entry", () => {
  assert.equal(nativeBackAction({ canGoBack: false }, 1), "minimize")
})
