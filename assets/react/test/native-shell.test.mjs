import test from "node:test"
import assert from "node:assert/strict"

import { compareSemver, normalizeServerUrl, parseSemver } from "../src/lib/native-shell.ts"

test("normalizeServerUrl trims paths and defaults to HTTPS", () => {
  assert.equal(normalizeServerUrl(" manavault.example.com/collection "), "https://manavault.example.com")
  assert.equal(normalizeServerUrl("http://192.168.1.10:4000/settings"), "http://192.168.1.10:4000")
})

test("normalizeServerUrl rejects empty and non-HTTP URLs", () => {
  assert.throws(() => normalizeServerUrl("   "), /Enter a ManaVault URL/)
  assert.throws(() => normalizeServerUrl("file:///tmp/manavault"), /http:\/\/ or https:\/\//)
})

test("compareSemver handles v-prefixed GitHub tags", () => {
  assert.deepEqual(parseSemver("v1.2.3"), [1, 2, 3])
  assert.equal(compareSemver("v1.2.4", "1.2.3"), 1)
  assert.equal(compareSemver("1.2.3", "v1.2.4"), -1)
  assert.equal(compareSemver("bad", "1.2.4"), 0)
})
