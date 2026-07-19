import test from "node:test"
import assert from "node:assert/strict"

import config from "../../../capacitor.config.json" with { type: "json" }

test("capacitor config does not allow in-app navigation for all hosts", () => {
  assert.ok(config.server)
  assert.equal(config.server.allowNavigation, undefined)
})
