import test from "node:test"
import assert from "node:assert/strict"

import {
  hasDeckPullWork,
  summarizeDeckPullNeeds,
  summarizeDeckReadiness,
} from "../src/pages/decks/deck-readiness.ts"

function deckCard(allocationStatus, overrides = {}) {
  return { allocationStatus, zone: "mainboard", ...overrides }
}

function status(overrides = {}) {
  return {
    allocated: 0,
    available: 0,
    missing: 0,
    owned: 0,
    proxyAllocated: 0,
    required: 1,
    state: "missing",
    candidates: [],
    ...overrides,
  }
}

test("summarizes pull, buy, proxy, and readiness counts", () => {
  const summary = summarizeDeckReadiness([
    deckCard(status({ allocated: 1, required: 1, state: "allocated" })),
    deckCard(status({ available: 2, missing: 0, required: 2, state: "available" })),
    deckCard(status({ allocated: 1, missing: 1, required: 2, state: "partial" })),
    deckCard(status({ allocated: 0, proxyAllocated: 1, required: 1, state: "missing" })),
  ])

  assert.deepEqual(summary, {
    availableToPull: 2,
    missingToBuy: 1,
    proxyAllocated: 1,
    readyCount: 3,
    readinessPercent: 50,
    requiredCount: 6,
  })
})

test("treats basic lands as ready without collection allocation", () => {
  const summary = summarizeDeckReadiness([
    deckCard(status({ required: 8, state: "basic_land" })),
    deckCard(status({ allocated: 1, required: 2, state: "partial", missing: 1 })),
  ])

  assert.equal(summary.readyCount, 9)
  assert.equal(summary.requiredCount, 10)
  assert.equal(summary.readinessPercent, 90)
  assert.equal(summary.missingToBuy, 1)
})

test("deck pull readiness includes commander and excludes sideboard and maybeboard", () => {
  const summary = summarizeDeckPullNeeds([
    deckCard(status({ allocated: 1, required: 1, state: "allocated" })),
    deckCard(status({ missing: 1, required: 1, state: "missing" }), { zone: "commander" }),
    deckCard(status({ missing: 1, required: 1, state: "missing" }), { zone: "sideboard" }),
    deckCard(status({ missing: 1, required: 1, state: "missing" }), { zone: "maybeboard" }),
  ])

  assert.equal(summary.readyCount, 1)
  assert.equal(summary.requiredCount, 2)
  assert.equal(summary.missingToBuy, 1)
  assert.equal(summary.readinessPercent, 50)
})

test("proxied pull-list cards do not keep readiness visible", () => {
  assert.equal(
    hasDeckPullWork([
      deckCard(status({ allocated: 0, missing: 1, proxyAllocated: 1, required: 1 })),
    ]),
    false,
  )
})

test("empty decks are ready by definition", () => {
  assert.equal(summarizeDeckReadiness([]).readinessPercent, 100)
})
