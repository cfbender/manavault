import test from "node:test"
import assert from "node:assert/strict"

import config from "../../../capacitor.config.ts"

test("capacitor config does not allow in-app navigation for all hosts", () => {
  assert.ok(config.server)
  assert.equal(config.server.allowNavigation, undefined)
})
