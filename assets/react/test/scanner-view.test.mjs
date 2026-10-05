import test from "node:test"
import assert from "node:assert/strict"

import { IDLE_VIEW, NOTICE_DELAY_MS, nextView } from "../src/pages/scan/scan-view.ts"

const quad = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]
const result = {
  quad,
  upVote: 1,
  candidates: [],
  timings: { detector: 0, embed: 0, search: 0, total: 300 },
}
const card = { id: "a", name: "Solitary Cell", set: "fra", frame: "modern", index: 0, score: 0.9 }

function step(view, type, now) {
  return nextView(view, { type, candidate: card }, result, now)
}

test("already logged is held back while the scan confirmation stays on screen", () => {
  let view = step(IDLE_VIEW, "accept", 0)
  assert.equal(view.outcome, "accept")
  assert.equal(view.logged, 1)
  view = step(view, "duplicate", 300)
  view = step(view, "duplicate", 300 + NOTICE_DELAY_MS - 1)
  assert.equal(view.outcome, "accept")
  assert.equal(view.logged, 1) // the flash does not replay
  view = step(view, "duplicate", 300 + NOTICE_DELAY_MS)
  assert.equal(view.outcome, "duplicate")
})

test("not in locked sets appears only once it persists", () => {
  let view = step(IDLE_VIEW, "outside-lock", 1000)
  assert.equal(view.outcome, "tracking")
  view = step(view, "outside-lock", 1000 + NOTICE_DELAY_MS)
  assert.equal(view.outcome, "outside-lock")
  // A different outcome restarts the clock.
  view = step(view, "empty", 5000)
  assert.equal(view.outcome, "empty")
  assert.equal(view.quad, null)
  assert.equal(step(view, "outside-lock", 5100).outcome, "tracking")
})

test("tokens mode: ready shows at once, and a tap's Logged holds while the token stays", () => {
  let view = step(IDLE_VIEW, "ready", 0)
  assert.equal(view.outcome, "ready")
  assert.equal(view.candidate, card)
  // The tap logs it: the confirmation flashes once…
  view = step(view, "accept", 100)
  assert.equal(view.outcome, "accept")
  assert.equal(view.logged, 1)
  // …and stays while the same token is still in view, then "ready" returns for another tap.
  view = step(view, "ready", 400)
  assert.equal(view.outcome, "accept")
  assert.equal(view.logged, 1)
  view = step(view, "ready", 400 + NOTICE_DELAY_MS)
  assert.equal(view.outcome, "ready")
})
